import { db, type Tx } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { evaluateAndPersist } from "@/server/case-engine";

export interface CaseAuth {
  /** Permission a staff member needs (scoped to the case) */
  staff: string;
  /** Permission a student needs on their own case; omit to make the action staff-only */
  self?: string;
}

/** Authorize an action on a case. Students only ever act on their own case. */
export async function authorizeCase(actor: AuthUser, caseId: string, auth: CaseAuth): Promise<void> {
  if (actor.roleKey === "STUDENT") {
    if (!auth.self) throw new ForbiddenError();
    await requirePermission(actor, auth.self, { caseId });
    return;
  }
  await requirePermission(actor, auth.staff, { caseId });
}

/**
 * Authorize, mutate, then re-run the requirement engine — all in ONE transaction so the checklist can never
 * disagree with the facts. The reason is recorded in the audit log.
 */
export async function mutateCase<T>(
  actor: AuthUser,
  caseId: string,
  auth: CaseAuth,
  reason: string,
  fn: (tx: Tx) => Promise<T>,
  opts: { reevaluate?: boolean; ip?: string | null } = {},
): Promise<T> {
  await authorizeCase(actor, caseId, auth);
  return db.$transaction(
    async (tx) => {
      const result = await fn(tx);
      if (opts.reevaluate !== false) await evaluateAndPersist(caseId, { userId: actor.id, reason, ip: opts.ip }, tx);
      return result;
    },
    { timeout: 30_000 },
  );
}

/** The single case of the acting student (students never pass a case id from the client). */
export async function ownCaseId(actor: AuthUser): Promise<string> {
  if (actor.roleKey !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Student account required");
  const c = await db.case.findFirst({ where: { studentId: actor.studentId, status: { not: "CLOSED" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!c) throw new NotFoundError("No active case");
  return c.id;
}

export async function audit(actor: AuthUser, tx: Tx, action: string, entity: string, entityId: string, caseId: string, metadata?: Record<string, unknown>) {
  await writeAudit({ userId: actor.id, action, entity, entityId, caseId, metadata: metadata as never }, tx);
}
