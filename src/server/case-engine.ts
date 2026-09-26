import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { fromISODate, toISODate } from "@/lib/dates";
import { evaluateCase } from "@/lib/engine/evaluate";
import { planIsEmpty, reconcileInstances, type ReconcilePlan } from "@/lib/engine/reconcile";
import type { EngineResult, ExistingInstance, HumanReviewFlag, RequirementStatus } from "@/lib/engine/types";
import { writeAudit, writeTimeline } from "@/server/audit";
import { loadCaseFacts } from "@/server/facts-loader";
import { loadProcedureDefinition } from "@/server/procedure-loader";

const PRIORITY_RANK = { NORMAL: 0, HIGH: 1, URGENT: 2 } as const;

export interface EvaluationActor {
  userId?: string | null;
  /** Why the engine ran, e.g. "sponsor.updated" — recorded in the audit log */
  reason: string;
  ip?: string | null;
}

export interface EvaluationSummary {
  created: number;
  reactivated: number;
  updated: number;
  markedNotApplicable: number;
  humanReviewOpen: number;
  changed: boolean;
}

const asDate = (iso: string | null | undefined) => (iso ? fromISODate(iso) : null);
const asJson = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/**
 * Load facts, run the (pure) engine, and persist the result:
 *  - add newly required instances,
 *  - mark instances that no longer apply NOT_APPLICABLE (never deleted; documents and versions stay attached),
 *  - sync human-review items and the case flag,
 *  - write the audit log and case timeline.
 */
export async function evaluateAndPersist(caseId: string, actor: EvaluationActor, client?: Tx): Promise<EvaluationSummary> {
  if (client) return run(client, caseId, actor);
  return db.$transaction((tx) => run(tx, caseId, actor), { timeout: 30_000 });
}

async function run(tx: Tx, caseId: string, actor: EvaluationActor): Promise<EvaluationSummary> {
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { procedureVersionId: true } });
  const [definition, facts] = await Promise.all([loadProcedureDefinition(c.procedureVersionId, tx), loadCaseFacts(caseId, tx)]);
  const result = evaluateCase(facts, definition);

  const rows = await tx.documentRequirementInstance.findMany({
    where: { caseId },
    include: { requirement: { select: { code: true } }, documents: { select: { versions: { select: { id: true }, take: 1 } } } },
  });
  const existing: ExistingInstance[] = rows.map((r) => ({
    id: r.id,
    key: `${r.requirement.code}|${r.subjectType}|${r.subjectId}`,
    status: r.status,
    previousStatus: r.previousStatus,
    hasDocuments: r.documents.some((d) => d.versions.length > 0),
    deadline: r.deadline ? toISODate(r.deadline) : null,
    humanReviewReason: r.humanReviewReason,
    calculation: r.calculation,
  }));
  const idByKey = new Map(existing.map((e) => [e.key, e.id]));

  const plan = reconcileInstances(existing, result.instances);
  await applyPlan(tx, caseId, plan, actor);
  const openReviews = await syncHumanReview(tx, caseId, result, existing, actor);

  await tx.case.update({
    where: { id: caseId },
    data: {
      requiresHumanReview: openReviews.count > 0,
      humanReviewPriority: openReviews.count > 0 ? openReviews.priority : null,
      engineSnapshot: asJson({
        funding: result.funding,
        passport: result.passport,
        deadlines: result.deadlines,
        effectiveAppointmentDeadlines: result.effectiveAppointmentDeadlines,
        visaMismatches: result.visaMismatches,
      }),
      evaluatedAt: new Date(),
    },
  });
  void idByKey;

  const summary: EvaluationSummary = {
    created: plan.create.length,
    reactivated: plan.reactivate.length,
    updated: plan.update.length,
    markedNotApplicable: plan.markNotApplicable.length,
    humanReviewOpen: openReviews.count,
    changed: !planIsEmpty(plan),
  };

  if (summary.changed) {
    await writeAudit(
      { userId: actor.userId, action: "engine.reevaluate", entity: "Case", entityId: caseId, caseId, ip: actor.ip, metadata: { reason: actor.reason, ...summary } },
      tx,
    );
    if (summary.created || summary.markedNotApplicable || summary.reactivated) {
      await writeTimeline(
        {
          caseId,
          type: "checklist.updated",
          title: "Checklist updated",
          detail: `${summary.created} added, ${summary.markedNotApplicable} no longer applicable, ${summary.reactivated} re-activated`,
          actorId: actor.userId,
          metadata: { reason: actor.reason },
        },
        tx,
      );
    }
  }
  return summary;
}

async function applyPlan(tx: Tx, caseId: string, plan: ReconcilePlan, actor: EvaluationActor): Promise<void> {
  for (const r of plan.create) {
    const status: RequirementStatus = r.status ?? "NOT_STARTED";
    const created = await tx.documentRequirementInstance.create({
      data: {
        caseId,
        requirementId: r.requirementId,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        subjectLabel: r.subjectLabel,
        status,
        deadline: asDate(r.deadline),
        calculation: asJson(r.calculation),
        referenceDate: asDate(r.referenceDate),
        humanReviewReason: r.humanReviewReason ?? null,
      },
    });
    await tx.requirementInstanceHistory.create({
      data: { instanceId: created.id, toStatus: status, actorId: actor.userId, reason: `Required by engine (${actor.reason})` },
    });
  }

  for (const { existing, required, restoreStatus } of plan.reactivate) {
    await tx.documentRequirementInstance.update({
      where: { id: existing.id },
      data: {
        status: restoreStatus,
        previousStatus: null,
        subjectLabel: required.subjectLabel,
        deadline: asDate(required.deadline),
        calculation: asJson(required.calculation),
        referenceDate: asDate(required.referenceDate),
        humanReviewReason: required.humanReviewReason ?? null,
      },
    });
    await tx.requirementInstanceHistory.create({
      data: { instanceId: existing.id, fromStatus: "NOT_APPLICABLE", toStatus: restoreStatus, actorId: actor.userId, reason: `Applies again (${actor.reason})` },
    });
  }

  for (const u of plan.update) {
    const data: Prisma.DocumentRequirementInstanceUpdateInput = {};
    if (u.status) data.status = u.status;
    if (u.deadline !== undefined) data.deadline = asDate(u.deadline);
    if (u.calculationChanged) {
      data.calculation = u.required.calculation === undefined ? undefined : asJson(u.required.calculation);
      data.referenceDate = asDate(u.required.referenceDate);
      data.humanReviewReason = u.required.humanReviewReason ?? null;
    }
    await tx.documentRequirementInstance.update({ where: { id: u.existing.id }, data });
    if (u.status && u.status !== u.existing.status) {
      await tx.requirementInstanceHistory.create({
        data: { instanceId: u.existing.id, fromStatus: u.existing.status, toStatus: u.status, actorId: actor.userId, reason: `Recalculated (${actor.reason})` },
      });
    }
  }

  for (const ex of plan.markNotApplicable) {
    await tx.documentRequirementInstance.update({
      where: { id: ex.id },
      data: { status: "NOT_APPLICABLE", previousStatus: ex.status },
    });
    await tx.requirementInstanceHistory.create({
      data: { instanceId: ex.id, fromStatus: ex.status, toStatus: "NOT_APPLICABLE", actorId: actor.userId, reason: `No longer applicable (${actor.reason})` },
    });
  }
}

/** Keep engine-raised human-review items in step with the flags of the latest evaluation. */
async function syncHumanReview(
  tx: Tx,
  caseId: string,
  result: EngineResult,
  existing: ExistingInstance[],
  actor: EvaluationActor,
): Promise<{ count: number; priority: "NORMAL" | "HIGH" | "URGENT" }> {
  // Flags whose instance staff already cleared (APPROVED) stay resolved.
  const cleared = new Set(existing.filter((e) => e.status === "APPROVED").map((e) => e.key));
  const flagInstanceKey = (f: HumanReviewFlag) => `${f.code}|${f.subjectType}|${f.subjectId}`;
  const active = result.humanReviewFlags.filter((f) => !cleared.has(flagInstanceKey(f)));
  const activeKeys = new Set(active.map((f) => f.dedupeKey));

  for (const flag of active) {
    const found = await tx.humanReviewItem.findUnique({ where: { caseId_dedupeKey: { caseId, dedupeKey: flag.dedupeKey } } });
    if (!found) {
      await tx.humanReviewItem.create({
        data: { caseId, source: flag.code === "VISA_PROGRAM_MISMATCH_REVIEW" ? "VISA_MISMATCH" : "ENGINE", dedupeKey: flag.dedupeKey, code: flag.code, reason: flag.reason, priority: flag.priority },
      });
    } else if (found.status === "RESOLVED" && found.resolvedById === null) {
      // auto-resolved earlier because the flag had disappeared; it is back
      await tx.humanReviewItem.update({
        where: { id: found.id },
        data: { status: "OPEN", resolvedAt: null, resolution: null, reason: flag.reason, priority: flag.priority },
      });
    } else if (found.status !== "RESOLVED" && (found.reason !== flag.reason || found.priority !== flag.priority)) {
      await tx.humanReviewItem.update({ where: { id: found.id }, data: { reason: flag.reason, priority: flag.priority } });
    }
  }

  // Engine-raised open items whose flag is gone are auto-resolved (never deleted).
  const stale = await tx.humanReviewItem.findMany({
    where: { caseId, source: { in: ["ENGINE", "VISA_MISMATCH"] }, status: { not: "RESOLVED" }, dedupeKey: { not: null } },
  });
  for (const item of stale) {
    if (item.dedupeKey && !activeKeys.has(item.dedupeKey)) {
      await tx.humanReviewItem.update({
        where: { id: item.id },
        data: { status: "RESOLVED", resolvedAt: new Date(), resolution: `No longer applicable after re-evaluation (${actor.reason})` },
      });
    }
  }

  const open = await tx.humanReviewItem.findMany({ where: { caseId, status: { not: "RESOLVED" } }, select: { priority: true } });
  let priority: "NORMAL" | "HIGH" | "URGENT" = "NORMAL";
  for (const o of open) if (PRIORITY_RANK[o.priority] > PRIORITY_RANK[priority]) priority = o.priority;
  return { count: open.length, priority };
}
