"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import {
  addDependency,
  cloneVersion,
  migrateCase,
  previewMigration,
  removeDependency,
  saveDeadline,
  saveParameter,
  saveRuleTree,
  setVersionStatus,
  updateRequirement,
  type MigrationDiff,
} from "@/server/procedures";
import { requireUser } from "@/server/session";

const refresh = () => revalidatePath("/admin", "layout");
type Values = Record<string, string | boolean>;
const clean = (v: Values) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""));

export async function statusAction(versionId: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED"): Promise<ActionResult> {
  return runAction(async () => {
    await setVersionStatus(await requireUser(), versionId, status);
    refresh();
  });
}

export async function cloneAction(versionId: string, academicYearId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = await cloneVersion(await requireUser(), versionId, academicYearId);
    refresh();
    return { id };
  });
}

export async function ruleTreeAction(requirementId: string, tree: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveRuleTree(await requireUser(), requirementId, tree);
    refresh();
  });
}

export async function requirementAction(requirementId: string, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    const formalities = String(v.requiredFormalities ?? "").split(/[\s,]+/).filter(Boolean);
    await updateRequirement(await requireUser(), requirementId, { ...clean(v), requiredFormalities: formalities });
    refresh();
  });
}

export async function addDependencyAction(requirementId: string, prerequisiteId: string): Promise<ActionResult> {
  return runAction(async () => {
    await addDependency(await requireUser(), requirementId, prerequisiteId);
    refresh();
  });
}

export async function removeDependencyAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await removeDependency(await requireUser(), id);
    refresh();
  });
}

export async function deadlineAction(versionId: string, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveDeadline(await requireUser(), versionId, clean(v));
    refresh();
  });
}

export async function parameterAction(versionId: string, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveParameter(await requireUser(), versionId, String(v.key ?? ""), String(v.value ?? ""), v.description ? String(v.description) : undefined);
    refresh();
  });
}

export async function previewMigrationAction(caseId: string, toVersionId: string): Promise<ActionResult<MigrationDiff>> {
  return runAction(async () => previewMigration(await requireUser(), caseId, toVersionId));
}

export async function migrateAction(caseId: string, toVersionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await migrateCase(await requireUser(), caseId, toVersionId);
    refresh();
  });
}
