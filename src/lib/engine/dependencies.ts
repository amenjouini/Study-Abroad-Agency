import type { DependencyDef, RequiredInstance, RequirementStatus } from "./types";

export type Satisfiable = Pick<RequiredInstance, "requirementCode" | "subjectType" | "subjectId"> & {
  status: RequirementStatus;
};

const SATISFIED: ReadonlySet<RequirementStatus> = new Set(["APPROVED", "NOT_APPLICABLE"]);

export function isSatisfied(status: RequirementStatus): boolean {
  return SATISFIED.has(status);
}

/**
 * A dependent requirement cannot be completed until its prerequisites are satisfied.
 * Prerequisites of the same subject type must belong to the same subject (father's chain vs uncle's);
 * prerequisites of another subject type (e.g. student-level) must all be satisfied.
 */
export function blockingPrerequisites<T extends Satisfiable>(target: Satisfiable, all: T[], deps: DependencyDef[]): T[] {
  const prereqCodes = deps.filter((d) => d.requirementCode === target.requirementCode).map((d) => d.prerequisiteCode);
  if (prereqCodes.length === 0) return [];
  return all.filter((i) => {
    if (!prereqCodes.includes(i.requirementCode)) return false;
    if (i.subjectType === target.subjectType && i.subjectId !== target.subjectId) return false;
    return !isSatisfied(i.status);
  });
}

export function canComplete<T extends Satisfiable>(
  target: Satisfiable,
  all: T[],
  deps: DependencyDef[],
): { ok: boolean; blockedBy: T[] } {
  const blockedBy = blockingPrerequisites(target, all, deps);
  return { ok: blockedBy.length === 0, blockedBy };
}

/** Detect cycles in the dependency graph (used by the admin editor before saving). */
export function hasDependencyCycle(deps: DependencyDef[]): boolean {
  const graph = new Map<string, string[]>();
  for (const d of deps) graph.set(d.requirementCode, [...(graph.get(d.requirementCode) ?? []), d.prerequisiteCode]);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (n: string): boolean => {
    if (done.has(n)) return false;
    if (visiting.has(n)) return true;
    visiting.add(n);
    for (const m of graph.get(n) ?? []) if (visit(m)) return true;
    visiting.delete(n);
    done.add(n);
    return false;
  };
  return [...graph.keys()].some(visit);
}
