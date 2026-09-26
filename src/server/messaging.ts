import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { validateUpload } from "@/lib/upload";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { authorizeCase, ownCaseId } from "@/server/case-access";
import { assignedStaffIds, notify, studentUserId } from "@/server/notifications";
import { rateLimit } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";

export interface FileInput {
  buffer: Buffer;
  filename: string;
}

async function storeAttachments(tx: Tx, messageId: string, caseId: string, files: FileInput[]): Promise<string[]> {
  const stored: string[] = [];
  for (const f of files) {
    const v = await validateUpload(f.buffer, f.filename);
    const key = `messages/${caseId}/${messageId}/${randomUUID()}.${v.extension}`;
    await getStorage().put(key, f.buffer, { contentType: v.mimeType });
    stored.push(key);
    await tx.messageAttachment.create({ data: { messageId, storageKey: key, filename: v.safeFilename, mimeType: v.mimeType, sizeBytes: v.sizeBytes } });
  }
  return stored;
}

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Existing documents of the same case referenced from the message */
  documentIds: z.array(z.string()).max(5).default([]),
});

/** Student ↔ assigned staff messaging with text, attachments and document references. */
export async function sendMessage(actor: AuthUser, input: unknown, files: FileInput[] = [], caseId?: string) {
  const data = messageSchema.parse(input);
  if (files.length > 5) throw new ValidationError("At most 5 attachments");
  const cid = actor.roleKey === "STUDENT" ? await ownCaseId(actor) : (caseId ?? (() => { throw new ValidationError("caseId is required"); })());
  await authorizeCase(actor, cid, { staff: "messages.write", self: "self.messages" });
  await rateLimit(`message:${actor.id}`, { limit: 30, windowSeconds: 60 });

  if (data.documentIds.length) {
    const docs = await db.document.count({ where: { id: { in: data.documentIds }, caseId: cid } });
    if (docs !== data.documentIds.length) throw new ForbiddenError("Document reference outside this case");
  }
  const recipients = actor.roleKey === "STUDENT" ? await assignedStaffIds(cid) : [await studentUserId(cid)];
  const keys: string[] = [];
  try {
    return await db.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { caseId: cid, senderId: actor.id, body: data.body } });
      keys.push(...(await storeAttachments(tx, m.id, cid, files)));
      for (const documentId of data.documentIds) await tx.messageAttachment.create({ data: { messageId: m.id, documentId } });
      await writeAudit({ userId: actor.id, action: "message.send", entity: "Message", entityId: m.id, caseId: cid }, tx);
      await notify(
        recipients.map((userId) => ({
          userId,
          caseId: cid,
          type: "message.new",
          title: "New message",
          body: data.body.slice(0, 120),
          data: { from: actor.name },
          link: actor.roleKey === "STUDENT" ? `/staff/messages?case=${cid}` : "/student/messages",
        })),
        tx,
      );
      return m.id;
    });
  } catch (e) {
    for (const k of keys) await getStorage().discard(k).catch(() => undefined);
    throw e;
  }
}

/** Thread of a case; reading marks the other side's messages as read. Students only ever see their own case. */
export async function getThread(actor: AuthUser, caseId: string) {
  await authorizeCase(actor, caseId, { staff: "messages.read", self: "self.messages" });
  const messages = await db.message.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
    include: { attachments: { include: { document: { include: { instance: { include: { requirement: { select: { name: true } } } } } } } } },
  });
  await db.message.updateMany({ where: { caseId, readAt: null, senderId: { not: actor.id } }, data: { readAt: new Date() } });
  const senders = await db.user.findMany({ where: { id: { in: [...new Set(messages.map((m) => m.senderId))] } }, select: { id: true, name: true, role: { select: { key: true } } } });
  const byId = new Map(senders.map((s) => [s.id, s]));
  return messages.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === actor.id,
    senderName: byId.get(m.senderId)?.name ?? "",
    senderRole: byId.get(m.senderId)?.role.key ?? "",
    attachments: m.attachments.map((a) => ({
      id: a.id,
      filename: a.filename ?? a.document?.instance.requirement.name ?? "document",
      isDocumentRef: !!a.documentId,
    })),
  }));
}

/** Authorized download of a message attachment. */
export async function readAttachment(actor: AuthUser, attachmentId: string) {
  const a = await db.messageAttachment.findUnique({ where: { id: attachmentId }, include: { message: { select: { caseId: true } } } });
  if (!a || !a.storageKey) throw new NotFoundError();
  await authorizeCase(actor, a.message.caseId, { staff: "messages.read", self: "self.messages" });
  return { body: await getStorage().get(a.storageKey), filename: a.filename ?? "file", mimeType: a.mimeType ?? "application/octet-stream" };
}

const helpSchema = z.object({
  description: z.string().trim().min(5).max(4000),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

/**
 * "I need help": the student describes the problem (optionally with files). The case is flagged
 * REQUIRES_HUMAN_REVIEW with the chosen priority; the staff dashboard shows these cases at the top.
 */
export async function createHelpRequest(actor: AuthUser, input: unknown, files: FileInput[] = []) {
  const data = helpSchema.parse(input);
  if (actor.roleKey !== "STUDENT") throw new ForbiddenError();
  const cid = await ownCaseId(actor);
  await requirePermission(actor, "self.help", { caseId: cid });
  await rateLimit(`help:${actor.id}`, { limit: 5, windowSeconds: 3600 });
  if (files.length > 5) throw new ValidationError("At most 5 attachments");

  const keys: string[] = [];
  try {
    return await db.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { caseId: cid, senderId: actor.id, body: data.description } });
      keys.push(...(await storeAttachments(tx, m.id, cid, files)));
      const item = await tx.humanReviewItem.create({
        data: { caseId: cid, source: "STUDENT_HELP", code: "STUDENT_HELP", reason: data.description.slice(0, 500), priority: data.priority, messageId: m.id, requestedById: actor.id },
      });
      const open = await tx.humanReviewItem.findMany({ where: { caseId: cid, status: { not: "RESOLVED" } }, select: { priority: true } });
      const rank = { NORMAL: 0, HIGH: 1, URGENT: 2 } as const;
      const top = open.reduce<"NORMAL" | "HIGH" | "URGENT">((acc, o) => (rank[o.priority] > rank[acc] ? o.priority : acc), "NORMAL");
      await tx.case.update({ where: { id: cid }, data: { requiresHumanReview: true, humanReviewPriority: top } });
      await writeAudit({ userId: actor.id, action: "help.request", entity: "HumanReviewItem", entityId: item.id, caseId: cid, metadata: { priority: data.priority } }, tx);
      await writeTimeline({ caseId: cid, type: "help.requested", title: "Help requested", actorId: actor.id, metadata: { priority: data.priority } }, tx);
      let staff = await assignedStaffIds(cid, tx);
      if (staff.length === 0) staff = (await tx.user.findMany({ where: { role: { key: { in: ["ADMIN", "OWNER"] } }, active: true }, select: { id: true } })).map((u) => u.id);
      await notify(staff.map((userId) => ({ userId, caseId: cid, type: "help.requested", title: "A student needs help", body: data.description.slice(0, 120), data: { priority: data.priority }, link: "/staff/dashboard" })), tx);
      return item.id;
    });
  } catch (e) {
    for (const k of keys) await getStorage().discard(k).catch(() => undefined);
    throw e;
  }
}

/**
 * Resolve a human-review item. Engine-raised items about a requirement mark that requirement APPROVED
 * (staff cleared it), so the engine does not re-open it on the next evaluation.
 */
export async function resolveHumanReview(actor: AuthUser, itemId: string, resolution: string) {
  const item = await db.humanReviewItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError();
  await requirePermission(actor, "humanreview.resolve", { caseId: item.caseId });
  if (actor.roleKey === "STUDENT") throw new ForbiddenError();
  if (!resolution.trim()) throw new ValidationError("A resolution note is required");
  await db.$transaction(async (tx) => {
    await tx.humanReviewItem.update({ where: { id: item.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actor.id, resolution: resolution.trim() } });
    if (item.dedupeKey && item.source !== "STUDENT_HELP") {
      const [code, subjectId] = item.dedupeKey.split(":");
      const inst = await tx.documentRequirementInstance.findFirst({ where: { caseId: item.caseId, subjectId, requirement: { code, kind: "HUMAN_REVIEW" } } });
      if (inst && inst.status === "REQUIRES_HUMAN_REVIEW") {
        await tx.documentRequirementInstance.update({ where: { id: inst.id }, data: { status: "APPROVED", reviewerId: actor.id, reviewedAt: new Date() } });
        await tx.requirementInstanceHistory.create({ data: { instanceId: inst.id, fromStatus: "REQUIRES_HUMAN_REVIEW", toStatus: "APPROVED", actorId: actor.id, reason: resolution.trim() } });
      }
    }
    const open = await tx.humanReviewItem.findMany({ where: { caseId: item.caseId, status: { not: "RESOLVED" } }, select: { priority: true } });
    const rank = { NORMAL: 0, HIGH: 1, URGENT: 2 } as const;
    const top = open.reduce<"NORMAL" | "HIGH" | "URGENT">((acc, o) => (rank[o.priority] > rank[acc] ? o.priority : acc), "NORMAL");
    await tx.case.update({ where: { id: item.caseId }, data: { requiresHumanReview: open.length > 0, humanReviewPriority: open.length ? top : null } });
    await writeAudit({ userId: actor.id, action: "humanreview.resolve", entity: "HumanReviewItem", entityId: item.id, caseId: item.caseId, metadata: { resolution: resolution.trim() } }, tx);
    await writeTimeline({ caseId: item.caseId, type: "humanreview.resolved", title: "Review completed", detail: item.code === "STUDENT_HELP" ? undefined : item.reason, actorId: actor.id, visibleToStudent: item.source === "STUDENT_HELP" }, tx);
  });
}
