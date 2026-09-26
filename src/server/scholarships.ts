import { z } from "zod";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { audit, mutateCase, ownCaseId } from "@/server/case-access";
import type { AuthUser } from "@/server/authz";

const CASE_AUTH = { staff: "scholarships.write", self: "self.profile" } as const;

export async function addScholarshipApplication(actor: AuthUser, scholarshipVersionId: string, caseId?: string) {
  const cid = actor.roleKey === "STUDENT" ? await ownCaseId(actor) : (caseId ?? (() => { throw new ValidationError("caseId is required"); })());
  const version = await db.scholarshipVersion.findUnique({ where: { id: scholarshipVersionId } });
  if (!version) throw new NotFoundError("Scholarship not found");
  return mutateCase(actor, cid, CASE_AUTH, "scholarship.add", async (tx) => {
    const existing = await tx.scholarshipApplication.findFirst({ where: { caseId: cid, scholarshipVersionId, status: { not: "WITHDRAWN" } } });
    if (existing) return existing.id;
    const sa = await tx.scholarshipApplication.create({ data: { caseId: cid, scholarshipVersionId, status: "PLANNED" } });
    await tx.student.updateMany({ where: { cases: { some: { id: cid } } }, data: { wantsScholarship: true } });
    await audit(actor, tx, "scholarship_application.create", "ScholarshipApplication", sa.id, cid);
    return sa.id;
  });
}

const updateSchema = z.object({
  status: z.enum(["PLANNED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION", "AWARDED", "REJECTED", "WITHDRAWN"]),
  awardedAmount: z.string().trim().max(20).optional(),
  awardedCurrency: z.enum(["EUR", "TND"]).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Students report progress (planned / preparing / submitted / withdrawn); staff record the outcome and the awarded amount. */
export async function updateScholarshipApplication(actor: AuthUser, id: string, input: unknown) {
  const data = updateSchema.parse(input);
  const sa = await db.scholarshipApplication.findUnique({ where: { id } });
  if (!sa) throw new NotFoundError();
  if (actor.roleKey === "STUDENT" && !["PLANNED", "PREPARING", "SUBMITTED", "WITHDRAWN"].includes(data.status)) {
    throw new ValidationError("Only the agency can record this status");
  }
  const awarded = data.awardedAmount && actor.roleKey !== "STUDENT" ? parseMoney(data.awardedAmount, data.awardedCurrency ?? "EUR") : null;
  return mutateCase(actor, sa.caseId, CASE_AUTH, "scholarship.update", async (tx) => {
    await tx.scholarshipApplication.update({
      where: { id },
      data: {
        status: data.status,
        submittedAt: data.status === "SUBMITTED" && !sa.submittedAt ? new Date() : sa.submittedAt,
        notes: data.notes ?? sa.notes,
        ...(awarded ? { awardedAmountMinor: awarded.amountMinor, awardedCurrency: awarded.currency } : {}),
      },
    });
    await audit(actor, tx, "scholarship_application.update", "ScholarshipApplication", id, sa.caseId, { status: data.status });
  });
}
