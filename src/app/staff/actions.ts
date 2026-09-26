"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/server/action";
import { reviewDocumentVersion, startReview } from "@/server/documents";
import { resolveHumanReview } from "@/server/messaging";
import { assignPaymentPlan, recordTransaction } from "@/server/payments";
import { updateAppointment } from "@/server/appointments";
import { requireUser } from "@/server/session";
import { addNote, addTask, assignStaff, confirmRequiredAmount, reevaluateCase, setCaseStage, setPlannedSubmissionDate, setTaskStatus } from "@/server/staff-actions";
import { updateScholarshipApplication } from "@/server/scholarships";
import { saveApplication, saveSponsorStatus, saveUniversitaly, saveVisa, setEurValue } from "@/server/student-data";
import { parseMoney } from "@/lib/money";

const done = (path?: string) => {
  revalidatePath(path ?? "/staff", "layout");
};

export async function stageAction(caseId: string, stageKey: string): Promise<ActionResult> {
  return runAction(async () => {
    await setCaseStage(await requireUser(), caseId, stageKey);
    done();
  });
}

export async function assignAction(caseId: string, userId: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await assignStaff(await requireUser(), caseId, userId, active);
    done();
  });
}

export async function noteAction(caseId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    await addNote(await requireUser(), caseId, body);
    done();
  });
}

export async function taskAction(caseId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await addTask(await requireUser(), caseId, input);
    done();
  });
}

export async function taskStatusAction(taskId: string, status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"): Promise<ActionResult> {
  return runAction(async () => {
    await setTaskStatus(await requireUser(), taskId, status);
    done();
  });
}

export async function plannedSubmissionAction(caseId: string, date: string | null): Promise<ActionResult> {
  return runAction(async () => {
    await setPlannedSubmissionDate(await requireUser(), caseId, date || null);
    done();
  });
}

export async function confirmRequiredAction(caseId: string, amount: string | null): Promise<ActionResult> {
  return runAction(async () => {
    await confirmRequiredAmount(await requireUser(), caseId, amount || null);
    done();
  });
}

export async function reevaluateAction(caseId: string): Promise<ActionResult> {
  return runAction(async () => {
    await reevaluateCase(await requireUser(), caseId);
    done();
  });
}

export async function eurValueAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await setEurValue(await requireUser(), input);
    done();
  });
}

export async function sponsorStatusAction(caseId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveSponsorStatus(await requireUser(), input, caseId);
    done();
  });
}

export async function applicationAction(caseId: string, applicationId: string | undefined, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveApplication(await requireUser(), input, { caseId, applicationId });
    done();
  });
}

export async function universitalyAction(applicationId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveUniversitaly(await requireUser(), applicationId, input);
    done();
  });
}

export async function visaAction(applicationId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveVisa(await requireUser(), applicationId, input);
    done();
  });
}

export async function scholarshipAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateScholarshipApplication(await requireUser(), id, input);
    done();
  });
}

export async function resolveReviewAction(itemId: string, resolution: string): Promise<ActionResult> {
  return runAction(async () => {
    await resolveHumanReview(await requireUser(), itemId, resolution);
    done();
  });
}

export async function appointmentAction(id: string, status: string, newStart?: string): Promise<ActionResult> {
  return runAction(async () => {
    await updateAppointment(await requireUser(), id, { status, newStart });
    done();
  });
}

export async function transactionAction(input: { paymentId: string; amount: string; currency: string; paidAt: string; method: string; reference?: string; notes?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const amount = parseMoney(input.amount, input.currency);
    await recordTransaction(user, {
      paymentId: input.paymentId,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      paidAt: input.paidAt,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
    });
    done();
  });
}

export async function assignPlanAction(caseId: string): Promise<ActionResult> {
  return runAction(async () => {
    await assignPaymentPlan(await requireUser(), caseId);
    done();
  });
}

export async function reviewAction(input: { versionId: string; decision: "APPROVE" | "REJECT" | "REQUEST_REPLACEMENT" | "COMMENT"; reason?: string; comment?: string; internal?: boolean; formalities?: Record<string, boolean> }): Promise<ActionResult> {
  return runAction(async () => {
    await reviewDocumentVersion(await requireUser(), input as never);
    done();
  });
}

export async function startReviewAction(instanceId: string): Promise<ActionResult> {
  return runAction(async () => {
    await startReview(await requireUser(), instanceId);
    done();
  });
}
