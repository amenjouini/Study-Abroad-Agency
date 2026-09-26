"use server";

import { revalidatePath } from "next/cache";
import { getRequestIp, runAction, type ActionResult } from "@/server/action";
import {
  addFundingSource,
  completeOnboarding,
  removeFundingSource,
  saveAcademic,
  saveCity,
  saveLanguage,
  savePersonal,
  saveProgramChoice,
  saveScholarshipChoice,
  saveSponsor,
  saveSponsorStatus,
  setOnboardingStep,
} from "@/server/student-data";
import { requireUser } from "@/server/session";

export type StepKey = "personal" | "language" | "academic" | "city" | "program" | "scholarship" | "sponsor" | "sponsorStatus";

const STEP_NUMBER: Record<StepKey, number> = {
  personal: 1,
  language: 2,
  academic: 3,
  city: 4,
  program: 5,
  scholarship: 6,
  sponsor: 8,
  sponsorStatus: 9,
};

/** Every step is validated with zod on the server and authorized against the student's own case. Progress is saved after each step. */
export async function saveStepAction(step: StepKey, input: unknown): Promise<ActionResult<{ next: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    void (await getRequestIp());
    switch (step) {
      case "personal":
        await savePersonal(user, input);
        break;
      case "language":
        await saveLanguage(user, input);
        break;
      case "academic":
        await saveAcademic(user, input);
        break;
      case "city":
        await saveCity(user, input);
        break;
      case "program":
        await saveProgramChoice(user, input);
        break;
      case "scholarship":
        await saveScholarshipChoice(user, input);
        break;
      case "sponsor":
        await saveSponsor(user, input);
        break;
      case "sponsorStatus":
        await saveSponsorStatus(user, input);
        break;
    }
    const next = STEP_NUMBER[step] + 1;
    await setOnboardingStep(user, next);
    revalidatePath("/student/onboarding");
    return { next };
  });
}

/** Step 7: funding sources are added / removed one by one; progress moves on when the student continues. */
export async function addFundingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const id = await addFundingSource(user, input);
    revalidatePath("/student/onboarding");
    return { id };
  });
}

export async function removeFundingAction(fundingSourceId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await removeFundingSource(user, fundingSourceId);
    revalidatePath("/student/onboarding");
  });
}

export async function continueStepAction(from: number): Promise<ActionResult<{ next: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    await setOnboardingStep(user, from + 1);
    revalidatePath("/student/onboarding");
    return { next: from + 1 };
  });
}

/** Step 10: run the engine on the completed profile and unlock the dashboard. */
export async function generateChecklistAction(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await completeOnboarding(user);
    revalidatePath("/student", "layout");
  });
}
