"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { addScholarshipApplication, updateScholarshipApplication } from "@/server/scholarships";
import { requireUser } from "@/server/session";
import { saveApplication, saveUniversitaly } from "@/server/student-data";

export async function addApplicationAction(programId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const id = await saveApplication(user, { programId, status: "PLANNED" });
    revalidatePath("/student", "layout");
    return { id };
  });
}

export async function setApplicationStatusAction(applicationId: string, programId: string, status: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await saveApplication(user, { programId, status }, { applicationId });
    revalidatePath("/student", "layout");
  });
}

export async function saveUniversitalyAction(applicationId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await saveUniversitaly(user, applicationId, input);
    revalidatePath("/student", "layout");
  });
}

export async function addScholarshipAction(versionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await addScholarshipApplication(user, versionId);
    revalidatePath("/student", "layout");
  });
}

export async function setScholarshipStatusAction(id: string, status: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await updateScholarshipApplication(user, id, { status });
    revalidatePath("/student", "layout");
  });
}
