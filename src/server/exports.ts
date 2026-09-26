import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { money, toDecimalString } from "@/lib/money";
import { writeAudit } from "@/server/audit";
import { caseAccessWhere, requirePermission, type AuthUser } from "@/server/authz";

export const EXPORT_KINDS = ["students", "payments", "documents", "appointments", "visa", "scholarships"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const LIMIT = 10_000;
const d = (v: Date | null | undefined) => (v ? toISODate(v) : "");
const dt = (v: Date | null | undefined) => (v ? v.toISOString() : "");

/** CSV export scoped to the cases the actor may read. Money is written as decimal amount + currency, never mixed. */
export async function exportCsv(actor: AuthUser, kind: string, ip?: string | null): Promise<{ filename: string; body: string }> {
  if (actor.roleKey === "STUDENT") throw new ForbiddenError();
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Unknown export");
  await requirePermission(actor, "exports.run");
  const k = kind as ExportKind;
  const perm = { students: "students.read", payments: "payments.read", documents: "documents.read", appointments: "appointments.read", visa: "visa.read", scholarships: "scholarships.read" }[k];
  const scope = await caseAccessWhere(actor, perm);
  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (k === "students") {
    const list = await db.case.findMany({ where: scope, take: LIMIT, orderBy: { caseNumber: "asc" }, include: { student: { include: { user: { select: { email: true } }, desiredCity: true } }, currentStage: true } });
    headers = ["case_number", "first_name", "last_name", "email", "phone", "nationality", "city", "stage", "status", "requires_human_review", "created_at"];
    rows = list.map((c) => [c.caseNumber, c.student.firstName, c.student.lastName, c.student.user.email, c.student.phone, c.student.nationality, c.student.desiredCity?.name, c.currentStage.key, c.status, c.requiresHumanReview, dt(c.createdAt)]);
  } else if (k === "payments") {
    const list = await db.paymentTransaction.findMany({ where: { payment: { case: scope } }, take: LIMIT, orderBy: { paidAt: "desc" }, include: { payment: { include: { case: { include: { student: true } } } } } });
    headers = ["case_number", "student", "payment", "amount", "currency", "paid_at", "method", "reference"];
    rows = list.map((t) => [t.payment.case.caseNumber, `${t.payment.case.student.firstName} ${t.payment.case.student.lastName}`, t.payment.name, toDecimalString(money(t.amountMinor, t.currency)), t.currency, d(t.paidAt), t.method, t.reference]);
  } else if (k === "documents") {
    const list = await db.documentRequirementInstance.findMany({ where: { case: scope, requirement: { kind: "DOCUMENT" }, status: { not: "NOT_APPLICABLE" } }, take: LIMIT, orderBy: { updatedAt: "desc" }, include: { requirement: true, case: { include: { student: true } } } });
    headers = ["case_number", "student", "requirement", "subject", "status", "deadline", "rejection_reason", "updated_at"];
    rows = list.map((i) => [i.case.caseNumber, `${i.case.student.firstName} ${i.case.student.lastName}`, i.requirement.name, i.subjectLabel, i.status, d(i.deadline), i.rejectionReason, dt(i.updatedAt)]);
  } else if (k === "appointments") {
    const list = await db.agencyAppointment.findMany({ where: { case: scope }, take: LIMIT, orderBy: { startsAt: "desc" }, include: { case: { include: { student: true } } } });
    headers = ["case_number", "student", "starts_at", "type", "status", "urgency", "reason"];
    rows = list.map((a) => [a.case.caseNumber, `${a.case.student.firstName} ${a.case.student.lastName}`, dt(a.startsAt), a.type, a.status, a.urgency, a.reason]);
  } else if (k === "visa") {
    const list = await db.visaCase.findMany({ where: { application: { case: scope } }, take: LIMIT, include: { application: { include: { university: true, program: true, case: { include: { student: true } } } } } });
    headers = ["case_number", "student", "university", "program", "stage", "appointment_at", "submission_date", "reference", "decision", "arrival_date"];
    rows = list.map((v) => [v.application.case.caseNumber, `${v.application.case.student.firstName} ${v.application.case.student.lastName}`, v.application.university.name, v.application.program.name, v.stage, dt(v.appointmentAt), d(v.submissionDate), v.reference, v.decision, d(v.arrivalDate)]);
  } else {
    const list = await db.scholarshipApplication.findMany({ where: { case: scope }, take: LIMIT, include: { scholarshipVersion: { include: { scholarship: true, academicYear: true } }, case: { include: { student: true } } } });
    headers = ["case_number", "student", "scholarship", "academic_year", "status", "awarded_amount", "awarded_currency", "submitted_at"];
    rows = list.map((s) => [s.case.caseNumber, `${s.case.student.firstName} ${s.case.student.lastName}`, s.scholarshipVersion.scholarship.name, s.scholarshipVersion.academicYear.label, s.status, s.awardedAmountMinor != null && s.awardedCurrency ? toDecimalString(money(s.awardedAmountMinor, s.awardedCurrency)) : "", s.awardedCurrency, dt(s.submittedAt)]);
  }
  await writeAudit({ userId: actor.id, action: "export.run", entity: "Export", entityId: k, ip, metadata: { rows: rows.length } });
  return { filename: `${k}-${toISODate(new Date())}.csv`, body: toCsv(headers, rows) };
}
