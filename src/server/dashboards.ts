import { db } from "@/lib/db";
import { toISODate, todayISO } from "@/lib/dates";
import { localized } from "@/lib/format";
import { money } from "@/lib/money";
import { nextPayment, summarizePayments, computePaymentStatus } from "@/lib/payments";
import { documentProgress, getCaseDocumentsView, nextAction } from "@/server/documents-queries";
import type { AuthUser } from "@/server/authz";
import { ownCaseId } from "@/server/case-access";

/** Everything on the student dashboard comes from the database — no hard-coded numbers or student data. */
export async function getStudentDashboard(actor: AuthUser, locale: string) {
  const caseId = await ownCaseId(actor);
  const today = todayISO();
  const [c, view, payments, apps, scholarship, appointment, review, unread] = await Promise.all([
    db.case.findUniqueOrThrow({ where: { id: caseId }, include: { currentStage: true, student: true } }),
    getCaseDocumentsView(actor, caseId, locale),
    db.payment.findMany({ where: { caseId }, include: { transactions: true }, orderBy: { sortOrder: "asc" } }),
    db.universityApplication.findMany({ where: { caseId }, include: { university: true, program: true, visa: true, universitaly: true }, orderBy: { createdAt: "asc" } }),
    db.scholarshipApplication.findFirst({ where: { caseId, status: { notIn: ["WITHDRAWN"] } }, include: { scholarshipVersion: { include: { scholarship: true } } }, orderBy: { createdAt: "asc" } }),
    db.agencyAppointment.findFirst({ where: { caseId, status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] }, startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
    db.humanReviewItem.count({ where: { caseId, status: { not: "RESOLVED" } } }),
    db.message.count({ where: { caseId, readAt: null, senderId: { not: actor.id } } }),
  ]);

  const payLike = payments.map((p) => {
    const paid = p.transactions.reduce((s, t) => s + t.amountMinor, 0);
    const due = p.dueDate ? toISODate(p.dueDate) : null;
    return { id: p.id, name: p.name, amountMinor: p.amountMinor, currency: p.currency, paidMinor: paid, dueDate: due, sortOrder: p.sortOrder, cancelled: p.status === "CANCELLED", status: computePaymentStatus({ amountMinor: p.amountMinor, currency: p.currency, paidMinor: paid, dueDate: due, cancelled: p.status === "CANCELLED" }, today) };
  });
  const totals = summarizePayments(payLike);
  const next = nextPayment(payLike);

  const action = nextAction(view.cards);
  const primary = apps.find((a) => a.status === "ACCEPTED" || a.status === "ENROLLED") ?? apps.find((a) => !["REJECTED", "WITHDRAWN"].includes(a.status)) ?? null;
  const deadlines = view.cards.filter((x) => x.deadline && x.status !== "APPROVED" && x.status !== "NOT_APPLICABLE").map((x) => x.deadline!).sort();
  const visaApp = apps.find((a) => a.visa) ?? null;

  return {
    firstName: c.student.firstName,
    onboardingCompleted: c.student.onboardingCompleted,
    stage: { key: c.currentStage.key, name: localized(c.currentStage.nameI18n, locale, c.currentStage.name), progress: c.currentStage.progressPercent },
    nextAction: action ? { name: action.name, subject: action.subjectType === "STUDENT" ? "" : action.subjectLabel, deadline: action.deadline, status: action.status } : null,
    deadline: action?.deadline ?? deadlines[0] ?? null,
    documents: { approved: view.approved, total: view.total },
    payments: {
      totals: totals.map((t) => ({ currency: t.currency, total: t.total, paid: t.paid, remaining: t.remaining })),
      next: next ? { name: next.name, dueDate: next.dueDate, amount: money(next.amountMinor - next.paidMinor, next.currency) } : null,
      hasLate: payLike.some((p) => p.status === "LATE"),
    },
    university: primary ? { name: primary.university.name, program: primary.program.name, status: primary.status } : null,
    applicationsCount: apps.length,
    scholarship: scholarship ? { name: scholarship.scholarshipVersion.scholarship.name, status: scholarship.status } : null,
    visa: visaApp?.visa ? { stage: visaApp.visa.stage, appointmentAt: visaApp.visa.appointmentAt?.toISOString() ?? null } : null,
    appointment: appointment ? { startsAt: appointment.startsAt.toISOString(), status: appointment.status } : null,
    underReview: review > 0,
    unreadMessages: unread,
  };
}

export { documentProgress };
