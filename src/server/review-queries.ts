import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { blockingPrerequisites } from "@/lib/engine/dependencies";
import { localized } from "@/lib/format";
import { caseAccessWhere, type AuthUser } from "@/server/authz";

/** Queue + selected item for the staff review screen. Scoped to the cases the actor may review. */
export async function getReviewWorkspace(actor: AuthUser, locale: string, selectedId?: string, scope: "pending" | "rejected" = "pending") {
  const caseWhere = await caseAccessWhere(actor, "documents.review");
  const statuses = scope === "pending" ? (["UPLOADED", "UNDER_REVIEW"] as const) : (["REJECTED", "NEEDS_CORRECTION"] as const);
  const queue = await db.documentRequirementInstance.findMany({
    where: { status: { in: [...statuses] }, requirement: { kind: "DOCUMENT" }, case: caseWhere },
    orderBy: { updatedAt: "asc" },
    take: 60,
    include: { requirement: { select: { name: true, nameI18n: true } }, case: { select: { id: true, student: { select: { firstName: true, lastName: true } } } } },
  });
  const items = queue.map((i) => ({
    id: i.id,
    name: localized(i.requirement.nameI18n, locale, i.requirement.name),
    student: `${i.case.student.firstName} ${i.case.student.lastName}`,
    subject: i.subjectLabel ?? "",
    status: i.status,
    updatedAt: i.updatedAt.toISOString(),
  }));

  const id = selectedId ?? items[0]?.id;
  if (!id) return { items, selected: null };

  const inst = await db.documentRequirementInstance.findFirst({
    where: { id, case: caseWhere },
    include: {
      requirement: { include: { source: true } },
      case: { include: { student: { include: { user: { select: { email: true } }, desiredCity: true } }, currentStage: true, procedureVersion: true } },
      documents: { include: { versions: { orderBy: { versionNumber: "desc" }, include: { reviews: { orderBy: { createdAt: "asc" } } } } } },
    },
  });
  if (!inst) return { items, selected: null };

  const [siblings, deps] = await Promise.all([
    db.documentRequirementInstance.findMany({ where: { caseId: inst.caseId }, include: { requirement: { select: { code: true, name: true } } } }),
    db.requirementDependency.findMany({
      where: { requirement: { procedureVersionId: inst.case.procedureVersionId } },
      include: { requirement: { select: { code: true } }, prerequisite: { select: { code: true } } },
    }),
  ]);
  const blocked = blockingPrerequisites(
    { requirementCode: inst.requirement.code, subjectType: inst.subjectType, subjectId: inst.subjectId },
    siblings.map((s) => ({ requirementCode: s.requirement.code, subjectType: s.subjectType, subjectId: s.subjectId, status: s.status, name: s.requirement.name })),
    deps.map((d) => ({ requirementCode: d.requirement.code, prerequisiteCode: d.prerequisite.code })),
  ).map((b) => b.name);

  const sponsor = inst.subjectType === "SPONSOR" ? await db.sponsor.findUnique({ where: { id: inst.subjectId }, include: { relationship: true } }) : null;
  const versions = inst.documents.flatMap((d) => d.versions);
  const reviewers = await db.user.findMany({ where: { id: { in: [...new Set(versions.flatMap((v) => v.reviews.map((r) => r.reviewerId)))] } }, select: { id: true, name: true } });
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));

  return {
    items,
    selected: {
      id: inst.id,
      caseId: inst.caseId,
      name: localized(inst.requirement.nameI18n, locale, inst.requirement.name),
      why: localized(inst.requirement.whyI18n, locale, inst.requirement.description ?? ""),
      status: inst.status,
      subjectType: inst.subjectType,
      subjectLabel: inst.subjectLabel ?? "",
      deadline: inst.deadline ? toISODate(inst.deadline) : null,
      requiredFormalities: inst.requirement.requiredFormalities,
      source: inst.requirement.source ? { name: inst.requirement.source.name, url: inst.requirement.sourceUrl ?? inst.requirement.source.url, verified: inst.requirement.dateVerified ? toISODate(inst.requirement.dateVerified) : null } : null,
      blockedBy: [...new Set(blocked)],
      student: {
        name: `${inst.case.student.firstName} ${inst.case.student.lastName}`,
        email: inst.case.student.user.email,
        phone: inst.case.student.phone,
        passportNumber: inst.case.student.passportNumber,
        city: inst.case.student.desiredCity?.name ?? null,
        stage: inst.case.currentStage.name,
        caseNumber: inst.case.caseNumber,
      },
      sponsor: sponsor ? { name: sponsor.fullName, relationship: sponsor.relationship.code, status: sponsor.professionalStatus, pensionFund: sponsor.pensionFund } : null,
      versions: versions.map((v) => ({
        id: v.id,
        number: v.versionNumber,
        status: v.status,
        filename: v.filename,
        mimeType: v.mimeType,
        uploadedAt: v.uploadedAt.toISOString(),
        rejectionReason: v.rejectionReason,
        formalities: { originalPresented: v.originalPresented, signed: v.signed, stamped: v.stamped, translated: v.translated, legalized: v.legalized, apostilled: v.apostilled },
        reviews: v.reviews.map((r) => ({ id: r.id, decision: r.decision, reason: r.reason, comment: r.comment, internal: r.internal, by: reviewerName.get(r.reviewerId) ?? "", at: r.createdAt.toISOString() })),
      })),
    },
  };
}

export type ReviewWorkspace = Awaited<ReturnType<typeof getReviewWorkspace>>;
