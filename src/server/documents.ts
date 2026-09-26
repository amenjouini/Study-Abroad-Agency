import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { canComplete } from "@/lib/engine/dependencies";
import type { Formality } from "@/lib/engine/constants";
import { FORMALITIES } from "@/lib/engine/constants";
import type { RequirementStatus } from "@/lib/engine/types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateUpload } from "@/lib/upload";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { assignedStaffIds, notify, studentUserId } from "@/server/notifications";
import { rateLimit } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";

const STUDENT_UPLOADABLE: ReadonlySet<RequirementStatus> = new Set([
  "NOT_STARTED",
  "REQUESTED",
  "UPLOADED",
  "UNDER_REVIEW",
  "REJECTED",
  "NEEDS_CORRECTION",
  "EXPIRED",
]);
const STAFF_UPLOADABLE: ReadonlySet<RequirementStatus> = new Set([...STUDENT_UPLOADABLE, "APPROVED"]);

export async function authorizeCaseDocuments(actor: AuthUser, caseId: string, mode: "upload" | "read" | "review"): Promise<void> {
  if (actor.roleKey === "STUDENT") {
    if (mode === "review") throw new ForbiddenError();
    await requirePermission(actor, mode === "upload" ? "self.documents" : "self.documents", { caseId });
    return;
  }
  const key = mode === "upload" ? "students.write" : mode === "review" ? "documents.review" : "documents.read";
  await requirePermission(actor, key, { caseId });
}

export interface UploadInput {
  instanceId: string;
  buffer: Buffer;
  filename: string;
  ip?: string | null;
}

/**
 * Upload a document (or a new version of it). Previous versions are marked SUPERSEDED, never deleted or overwritten.
 */
export async function uploadDocumentVersion(actor: AuthUser, input: UploadInput): Promise<{ versionId: string; versionNumber: number }> {
  const instance = await db.documentRequirementInstance.findUnique({
    where: { id: input.instanceId },
    include: { requirement: { include: { documentRequirements: { include: { documentType: true } } } }, documents: { include: { versions: { select: { versionNumber: true } } } } },
  });
  if (!instance) throw new NotFoundError("Requirement not found");
  await authorizeCaseDocuments(actor, instance.caseId, "upload");
  await rateLimit(`upload:${actor.id}`, { limit: 20, windowSeconds: 60 });

  if (instance.requirement.kind !== "DOCUMENT") throw new ValidationError("No document can be uploaded for this requirement");
  const allowed = actor.roleKey === "STUDENT" ? STUDENT_UPLOADABLE : STAFF_UPLOADABLE;
  if (!allowed.has(instance.status)) throw new ConflictError(`Documents cannot be uploaded while the requirement is ${instance.status}`);

  const docType = instance.requirement.documentRequirements[0]?.documentType;
  const validated = await validateUpload(input.buffer, input.filename, {
    maxBytes: docType?.maxBytes ?? undefined,
    acceptedMimeTypes: docType?.acceptedMimeTypes?.length ? docType.acceptedMimeTypes : undefined,
  });

  const existingDoc = instance.documents[0];
  const nextNumber = Math.max(0, ...(existingDoc?.versions.map((v) => v.versionNumber) ?? [])) + 1;
  const storageKey = `cases/${instance.caseId}/instances/${instance.id}/v${nextNumber}-${randomUUID()}.${validated.extension}`;
  const storage = getStorage();
  await storage.put(storageKey, input.buffer, { contentType: validated.mimeType });

  try {
    return await db.$transaction(async (tx) => {
      const doc = existingDoc ?? (await tx.document.create({ data: { caseId: instance.caseId, instanceId: instance.id } }));
      const now = new Date();
      // Supersede whatever version was current; it stays readable in the history.
      await tx.documentVersion.updateMany({
        where: { documentId: doc.id, status: { not: "SUPERSEDED" } },
        data: { status: "SUPERSEDED", supersededAt: now },
      });
      const version = await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: nextNumber,
          storageKey,
          filename: validated.safeFilename,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          sha256: validated.sha256,
          uploadedById: actor.id,
          status: "UPLOADED",
        },
      });
      const fromStatus = instance.status;
      await tx.documentRequirementInstance.update({
        where: { id: instance.id },
        data: { status: "UPLOADED", rejectionReason: null, reviewerId: null, reviewedAt: null },
      });
      await tx.requirementInstanceHistory.create({
        data: { instanceId: instance.id, fromStatus, toStatus: "UPLOADED", actorId: actor.id, reason: `Version ${nextNumber} uploaded` },
      });
      await writeAudit(
        { userId: actor.id, action: "document.upload", entity: "DocumentVersion", entityId: version.id, caseId: instance.caseId, ip: input.ip, metadata: { requirement: instance.requirement.code, version: nextNumber, sha256: validated.sha256 } },
        tx,
      );
      await writeTimeline(
        { caseId: instance.caseId, type: "document.uploaded", title: "Document uploaded", detail: `${instance.requirement.name} (v${nextNumber})`, actorId: actor.id, metadata: { instanceId: instance.id } },
        tx,
      );
      if (actor.roleKey === "STUDENT") {
        const staff = await assignedStaffIds(instance.caseId, tx);
        await notify(
          staff.map((userId) => ({
            userId,
            caseId: instance.caseId,
            type: "document.uploaded",
            title: "New document to review",
            body: instance.requirement.name,
            data: { requirement: instance.requirement.name, subject: instance.subjectLabel ?? "" },
            link: `/staff/documents?instance=${instance.id}`,
          })),
          tx,
        );
      }
      return { versionId: version.id, versionNumber: nextNumber };
    });
  } catch (e) {
    await storage.discard(storageKey).catch(() => undefined);
    throw e;
  }
}

export type ReviewInput = {
  versionId: string;
  decision: "APPROVE" | "REJECT" | "REQUEST_REPLACEMENT" | "COMMENT";
  reason?: string;
  comment?: string;
  /** Comments can be internal (staff only) */
  internal?: boolean;
  formalities?: Partial<Record<Formality, boolean>>;
  ip?: string | null;
};

/** Approve / reject / request a replacement / comment on a document version. */
export async function reviewDocumentVersion(actor: AuthUser, input: ReviewInput): Promise<void> {
  const version = await db.documentVersion.findUnique({
    where: { id: input.versionId },
    include: { document: { include: { instance: { include: { requirement: true, case: { select: { procedureVersionId: true } } } } } } },
  });
  if (!version) throw new NotFoundError("Document version not found");
  const instance = version.document.instance;
  const caseId = version.document.caseId;
  await authorizeCaseDocuments(actor, caseId, "review");

  if (input.decision !== "COMMENT" && version.status === "SUPERSEDED") {
    throw new ConflictError("This version has been superseded by a newer upload");
  }
  if ((input.decision === "REJECT" || input.decision === "REQUEST_REPLACEMENT") && !input.reason?.trim()) {
    throw new ValidationError("A reason is required");
  }

  // Formalities are tracked per version.
  const formalities = Object.fromEntries(
    FORMALITIES.map((f) => [f, input.formalities?.[f] ?? (version[f] as boolean)]),
  ) as Record<Formality, boolean>;

  if (input.decision === "APPROVE") {
    const missing = instance.requirement.requiredFormalities.filter((f) => !formalities[f as Formality]);
    if (missing.length) throw new ValidationError(`Required formalities not confirmed: ${missing.join(", ")}`);

    // A dependent requirement cannot be completed until its prerequisites are satisfied.
    const [all, deps] = await Promise.all([
      db.documentRequirementInstance.findMany({ where: { caseId }, include: { requirement: { select: { code: true } } } }),
      db.requirementDependency.findMany({
        where: { requirement: { procedureVersionId: instance.case.procedureVersionId } },
        include: { requirement: { select: { code: true } }, prerequisite: { select: { code: true } } },
      }),
    ]);
    const check = canComplete(
      { requirementCode: instance.requirement.code, subjectType: instance.subjectType, subjectId: instance.subjectId },
      all.map((i) => ({ requirementCode: i.requirement.code, subjectType: i.subjectType, subjectId: i.subjectId, status: i.status })),
      deps.map((d) => ({ requirementCode: d.requirement.code, prerequisiteCode: d.prerequisite.code })),
    );
    if (!check.ok) {
      throw new ConflictError(`Prerequisites not satisfied: ${check.blockedBy.map((b) => b.requirementCode).join(", ")}`);
    }
  }

  const studentId = await studentUserId(caseId);
  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.documentReview.create({
      data: {
        versionId: version.id,
        reviewerId: actor.id,
        decision: input.decision,
        reason: input.reason?.trim() || null,
        comment: input.comment?.trim() || null,
        internal: input.internal ?? input.decision === "COMMENT",
        formalities,
      },
    });

    const formalityData = { ...formalities };
    if (input.decision === "COMMENT") {
      await tx.documentVersion.update({ where: { id: version.id }, data: formalityData });
      return;
    }

    const versionStatus = { APPROVE: "APPROVED", REJECT: "REJECTED", REQUEST_REPLACEMENT: "NEEDS_CORRECTION" }[input.decision] as
      | "APPROVED"
      | "REJECTED"
      | "NEEDS_CORRECTION";
    const instanceStatus: RequirementStatus = versionStatus;
    await tx.documentVersion.update({
      where: { id: version.id },
      data: {
        ...formalityData,
        approved: input.decision === "APPROVE",
        status: versionStatus,
        reviewerId: actor.id,
        reviewedAt: now,
        rejectionReason: input.decision === "APPROVE" ? null : input.reason!.trim(),
        comments: input.comment?.trim() || version.comments,
      },
    });
    await tx.documentRequirementInstance.update({
      where: { id: instance.id },
      data: {
        status: instanceStatus,
        reviewerId: actor.id,
        reviewedAt: now,
        rejectionReason: input.decision === "APPROVE" ? null : input.reason!.trim(),
      },
    });
    await tx.requirementInstanceHistory.create({
      data: { instanceId: instance.id, fromStatus: instance.status, toStatus: instanceStatus, actorId: actor.id, reason: input.reason?.trim() || null },
    });

    const action = { APPROVE: "document.approve", REJECT: "document.reject", REQUEST_REPLACEMENT: "document.request_replacement" }[input.decision];
    await writeAudit(
      { userId: actor.id, action, entity: "DocumentVersion", entityId: version.id, caseId, ip: input.ip, metadata: { requirement: instance.requirement.code, version: version.versionNumber, reason: input.reason ?? null } },
      tx,
    );
    const titles = { APPROVE: "Document approved", REJECT: "Document rejected", REQUEST_REPLACEMENT: "Replacement requested" };
    await writeTimeline(
      { caseId, type: action, title: titles[input.decision], detail: `${instance.requirement.name}${input.reason ? ` — ${input.reason}` : ""}`, actorId: actor.id, metadata: { instanceId: instance.id } },
      tx,
    );
    await notify(
      {
        userId: studentId,
        caseId,
        type: input.decision === "APPROVE" ? "document.approved" : "document.rejected",
        title: titles[input.decision],
        body: instance.requirement.name,
        data: { requirement: instance.requirement.name, reason: input.reason ?? "" },
        link: "/student/documents",
      },
      tx,
    );
  });
}

/** Staff picks a freshly uploaded document up for review. */
export async function startReview(actor: AuthUser, instanceId: string): Promise<void> {
  const instance = await db.documentRequirementInstance.findUnique({ where: { id: instanceId }, select: { caseId: true, status: true } });
  if (!instance) throw new NotFoundError();
  await authorizeCaseDocuments(actor, instance.caseId, "review");
  if (instance.status !== "UPLOADED") return;
  await db.$transaction(async (tx) => {
    await tx.documentRequirementInstance.update({ where: { id: instanceId }, data: { status: "UNDER_REVIEW" } });
    await tx.documentVersion.updateMany({ where: { document: { instanceId }, status: "UPLOADED" }, data: { status: "UNDER_REVIEW" } });
    await tx.requirementInstanceHistory.create({ data: { instanceId, fromStatus: "UPLOADED", toStatus: "UNDER_REVIEW", actorId: actor.id } });
  });
}

/** Authorized download: the only way files leave storage. Students can only read their own case's documents. */
export async function readDocumentVersion(
  actor: AuthUser,
  versionId: string,
  ip?: string | null,
): Promise<{ body: Buffer; filename: string; mimeType: string }> {
  const version = await db.documentVersion.findUnique({ where: { id: versionId }, include: { document: { select: { caseId: true } } } });
  if (!version) throw new NotFoundError();
  await authorizeCaseDocuments(actor, version.document.caseId, "read");
  const body = await getStorage().get(version.storageKey);
  await writeAudit({ userId: actor.id, action: "document.download", entity: "DocumentVersion", entityId: version.id, caseId: version.document.caseId, ip });
  return { body, filename: version.filename, mimeType: version.mimeType };
}

/** Full, ordered version history of an instance's document (all versions stay accessible after replacement). */
export async function listVersionHistory(actor: AuthUser, instanceId: string) {
  const instance = await db.documentRequirementInstance.findUnique({ where: { id: instanceId }, select: { caseId: true } });
  if (!instance) throw new NotFoundError();
  await authorizeCaseDocuments(actor, instance.caseId, "read");
  const versions = await db.documentVersion.findMany({
    where: { document: { instanceId } },
    orderBy: { versionNumber: "desc" },
    include: { reviews: { orderBy: { createdAt: "asc" } } },
  });
  // Students never see internal comments
  if (actor.roleKey === "STUDENT") {
    return versions.map((v) => ({ ...v, reviews: v.reviews.filter((r) => !r.internal) }));
  }
  return versions;
}
