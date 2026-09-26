import type { ISODate } from "../dates";
import type { ExistingInstance, RequiredInstance, RequirementStatus } from "./types";

export interface InstanceUpdate {
  existing: ExistingInstance;
  required: RequiredInstance;
  status?: RequirementStatus;
  deadline?: ISODate | null;
  calculationChanged: boolean;
}

export interface ReconcilePlan {
  /** Instances that do not exist yet */
  create: RequiredInstance[];
  /** NOT_APPLICABLE instances that apply again; documents are still attached */
  reactivate: Array<{ existing: ExistingInstance; required: RequiredInstance; restoreStatus: RequirementStatus }>;
  /** Existing instances that changed (deadline, engine-owned status, calculated result) */
  update: InstanceUpdate[];
  /** No longer required. Never deleted: marked NOT_APPLICABLE, documents and versions stay attached. */
  markNotApplicable: ExistingInstance[];
}

/** JSON with sorted keys: PostgreSQL JSONB does not preserve key order, so plain JSON.stringify would differ. */
export function stableStringify(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Engine-owned statuses: calculated results and human-review flags. */
const ENGINE_OWNED: ReadonlySet<RequirementStatus> = new Set(["REQUIRES_HUMAN_REVIEW"]);

function restoreStatusFor(existing: ExistingInstance, required: RequiredInstance): RequirementStatus {
  if (required.status) return required.status;
  const prev = existing.previousStatus;
  if (prev && prev !== "NOT_APPLICABLE" && prev !== "REQUIRES_HUMAN_REVIEW") return prev;
  return existing.hasDocuments ? "UPLOADED" : "NOT_STARTED";
}

/**
 * Compare persisted instances with the engine output after facts changed.
 * The result is a plan; a service applies it, writes the audit log and the case timeline.
 */
export function reconcileInstances(existing: ExistingInstance[], required: RequiredInstance[]): ReconcilePlan {
  const existingByKey = new Map(existing.map((e) => [e.key, e]));
  const requiredKeys = new Set(required.map((r) => r.key));
  const plan: ReconcilePlan = { create: [], reactivate: [], update: [], markNotApplicable: [] };

  for (const req of required) {
    const ex = existingByKey.get(req.key);
    if (!ex) {
      plan.create.push(req);
      continue;
    }
    if (ex.status === "NOT_APPLICABLE") {
      plan.reactivate.push({ existing: ex, required: req, restoreStatus: restoreStatusFor(ex, req) });
      continue;
    }

    const update: InstanceUpdate = { existing: ex, required: req, calculationChanged: false };
    let changed = false;

    // A human-review item that staff already cleared (APPROVED) is not re-opened by the engine.
    const clearedReview = req.kind === "HUMAN_REVIEW" && ex.status === "APPROVED";
    if (clearedReview) {
      // keep staff decision
    } else if (req.status && ex.status !== req.status) {
      update.status = req.status;
      changed = true;
    } else if (!req.status && ENGINE_OWNED.has(ex.status)) {
      // The engine no longer demands a human review here: fall back to the document flow.
      update.status = ex.hasDocuments ? "UPLOADED" : "NOT_STARTED";
      changed = true;
    }
    const newDeadline = req.deadline ?? null;
    if ((ex.deadline ?? null) !== newDeadline) {
      update.deadline = newDeadline;
      changed = true;
    }
    const calcChanged =
      stableStringify(req.calculation) !== stableStringify(ex.calculation) ||
      (req.humanReviewReason ?? null) !== (ex.humanReviewReason ?? null);
    if (calcChanged) {
      update.calculationChanged = true;
      changed = true;
    }
    if (changed) plan.update.push(update);
  }

  for (const ex of existing) {
    if (!requiredKeys.has(ex.key) && ex.status !== "NOT_APPLICABLE") plan.markNotApplicable.push(ex);
  }
  return plan;
}

export function planIsEmpty(plan: ReconcilePlan): boolean {
  return (
    plan.create.length === 0 &&
    plan.reactivate.length === 0 &&
    plan.update.length === 0 &&
    plan.markNotApplicable.length === 0
  );
}
