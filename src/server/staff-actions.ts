import { z } from "zod";
import { db } from "@/lib/db";
import { fromISODate } from "@/lib/dates";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { audit, authorizeCase, mutateCase } from "@/server/case-access";
import { changeCaseStage } from "@/server/cases";
import { notify, studentUserId } from "@/server/notifications";

function staffOnly(actor: AuthUser) {
  if (actor.roleKey === "STUDENT") throw new ForbiddenError();
}

/** Move the case along the (configurable) journey; recorded in case_stage_history and on the timeline. */
export async function setCaseStage(actor: AuthUser, caseId: string, stageKey: string) {
  staffOnly(actor);
  await authorizeCase(actor, caseId, { staff: "students.write" });
  await db.$transaction(async (tx) => {
    await changeCaseStage(tx, caseId, stageKey, { userId: actor.id });
  });
}

export async function assignStaff(actor: AuthUser, caseId: string, userId: string, active: boolean) {
  staffOnly(actor);
  await requirePermission(actor, "cases.assign", { caseId });
  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target || target.role.key === "STUDENT") throw new ValidationError("Not a staff account");
  await db.$transaction(async (tx) => {
    await tx.caseAssignment.upsert({ where: { caseId_userId: { caseId, userId } }, create: { caseId, userId, active }, update: { active } });
    await audit(actor, tx, active ? "case.assign" : "case.unassign", "Case", caseId, caseId, { userId });
    await writeTimeline({ caseId, type: "case.assignment", title: active ? "Staff assigned" : "Staff unassigned", detail: target.name, actorId: actor.id, visibleToStudent: false }, tx);
    if (active) await notify({ userId, caseId, type: "case.assigned", title: "A case was assigned to you", data: {}, link: `/staff/students/${caseId}` }, tx);
  });
}

/** Internal notes are never shown to students. */
export async function addNote(actor: AuthUser, caseId: string, body: string) {
  staffOnly(actor);
  const text = z.string().trim().min(1).max(4000).parse(body);
  await authorizeCase(actor, caseId, { staff: "students.write" });
  await db.$transaction(async (tx) => {
    const n = await tx.note.create({ data: { caseId, authorId: actor.id, body: text } });
    await audit(actor, tx, "note.create", "Note", n.id, caseId);
  });
}

const taskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  assigneeUserId: z.string().optional(),
});

export async function addTask(actor: AuthUser, caseId: string, input: unknown) {
  staffOnly(actor);
  const data = taskSchema.parse(input);
  await authorizeCase(actor, caseId, { staff: "tasks.manage" });
  const assigneeUserId = data.assigneeUserId || actor.id;
  const profile = await db.staffProfile.findUnique({ where: { userId: assigneeUserId } });
  if (!profile) throw new ValidationError("The assignee has no staff profile");
  await db.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: { caseId, assigneeId: profile.id, title: data.title, description: data.description, dueDate: data.dueDate ? fromISODate(data.dueDate) : null, priority: data.priority, createdById: actor.id },
    });
    await audit(actor, tx, "task.create", "Task", t.id, caseId);
  });
}

export async function setTaskStatus(actor: AuthUser, taskId: string, status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED") {
  staffOnly(actor);
  const t = await db.task.findUnique({ where: { id: taskId }, include: { assignee: true } });
  if (!t) throw new NotFoundError();
  if (t.caseId) await authorizeCase(actor, t.caseId, { staff: "tasks.manage" });
  else await requirePermission(actor, "tasks.manage");
  await db.task.update({ where: { id: taskId }, data: { status } });
  await writeAudit({ userId: actor.id, action: "task.update", entity: "Task", entityId: taskId, caseId: t.caseId, metadata: { status } });
}

/** Passport reference date when no visa appointment is known yet (recomputes the passport check). */
export async function setPlannedSubmissionDate(actor: AuthUser, caseId: string, date: string | null) {
  staffOnly(actor);
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().parse(date);
  await mutateCase(actor, caseId, { staff: "students.write" }, "case.planned_submission", async (tx) => {
    await tx.case.update({ where: { id: caseId }, data: { plannedSubmissionDate: date ? fromISODate(date) : null } });
    await audit(actor, tx, "case.update", "Case", caseId, caseId, { plannedSubmissionDate: date });
  });
}

/** For programs shorter than the reference period the engine only PROPOSES a reduced amount; staff confirm it. */
export async function confirmRequiredAmount(actor: AuthUser, caseId: string, amount: string | null) {
  staffOnly(actor);
  const parsed = amount ? parseMoney(amount, "EUR") : null;
  await mutateCase(actor, caseId, { staff: "funding.write" }, "funding.confirm_required", async (tx) => {
    await tx.case.update({ where: { id: caseId }, data: { confirmedRequiredMinor: parsed?.amountMinor ?? null, confirmedRequiredCurrency: parsed?.currency ?? null } });
    await audit(actor, tx, "funding.confirm_required", "Case", caseId, caseId, { amountMinor: parsed?.amountMinor ?? null });
  });
}

/** Manually re-run the requirement engine (e.g. after a procedure change). */
export async function reevaluateCase(actor: AuthUser, caseId: string) {
  staffOnly(actor);
  return mutateCase(actor, caseId, { staff: "students.write" }, "manual", async () => undefined);
}

/** Staff message to the student when a case needs their attention. */
export async function pingStudent(actor: AuthUser, caseId: string, title: string) {
  staffOnly(actor);
  await authorizeCase(actor, caseId, { staff: "messages.write" });
  await notify({ userId: await studentUserId(caseId), caseId, type: "case.attention", title, data: {}, link: "/student/dashboard" });
}
