"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import {
  addPlanItem,
  convertLead,
  createStaffAccount,
  removePlanItem,
  saveArticle,
  saveLead,
  savePaymentPlan,
  saveProgram,
  saveScholarship,
  saveScholarshipVersion,
  saveSetting,
  saveStage,
  saveTemplate,
  saveUniversity,
  setUserActive,
  setUserPermission,
  type PermissionState,
} from "@/server/admin";
import { saveAppointmentSettings } from "@/server/appointments";
import { requireUser } from "@/server/session";

type Values = Record<string, string | boolean>;

/** ConfigForm posts every field; empty strings mean "not provided". */
const clean = (v: Values): Record<string, string | boolean> => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ""));
const refresh = () => revalidatePath("/admin", "layout");

export async function createStaffAction(v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await createStaffAccount(await requireUser(), clean(v));
    refresh();
  });
}
export async function setActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await setUserActive(await requireUser(), userId, active);
    refresh();
  });
}
export async function permissionAction(userId: string, key: string, state: PermissionState): Promise<ActionResult> {
  return runAction(async () => {
    await setUserPermission(await requireUser(), userId, key, state);
    refresh();
  });
}
export async function leadAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveLead(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function convertLeadAction(id: string): Promise<ActionResult<{ email: string; password: string; caseId: string }>> {
  return runAction(async () => {
    const r = await convertLead(await requireUser(), id);
    refresh();
    return r;
  });
}
export async function universityAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveUniversity(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function programAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveProgram(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function scholarshipAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveScholarship(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function scholarshipVersionAction(scholarshipId: string, id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveScholarshipVersion(await requireUser(), { ...clean(v), scholarshipId }, id);
    refresh();
  });
}
export async function planAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await savePaymentPlan(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function planItemAction(planId: string, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await addPlanItem(await requireUser(), planId, clean(v));
    refresh();
  });
}
export async function removePlanItemAction(itemId: string): Promise<ActionResult> {
  return runAction(async () => {
    await removePlanItem(await requireUser(), itemId);
    refresh();
  });
}
export async function articleAction(id: string | undefined, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveArticle(await requireUser(), clean(v), id);
    refresh();
  });
}
export async function settingAction(key: "agency.info" | "documents.retention", v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveSetting(await requireUser(), key, clean(v));
    refresh();
  });
}
export async function stageAction(id: string, v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveStage(await requireUser(), id, clean(v));
    refresh();
  });
}
export async function templateAction(v: Values): Promise<ActionResult> {
  return runAction(async () => {
    await saveTemplate(await requireUser(), clean(v));
    refresh();
  });
}
export async function appointmentSettingsAction(v: { workingDays: number[]; startTime: string; endTime: string; slotMinutes: number; maxPerDay: number; blockedDates: string[]; minNoticeHours: number }): Promise<ActionResult> {
  return runAction(async () => {
    await saveAppointmentSettings(await requireUser(), v);
    refresh();
  });
}
