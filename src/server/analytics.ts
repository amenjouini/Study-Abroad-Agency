import { db } from "@/lib/db";
import { toISODate, todayISO, addCalendarDays, fromISODate } from "@/lib/dates";
import { localized } from "@/lib/format";
import { ForbiddenError } from "@/lib/errors";
import { requirePermission, type AuthUser } from "@/server/authz";

export interface Datum {
  label: string;
  value: number;
}

const tally = (rows: string[]): Datum[] => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

/** Admin analytics. Every number comes from the database; money is grouped per currency and never summed across currencies. */
export async function getAdminAnalytics(actor: AuthUser, locale: string) {
  await requirePermission(actor, "analytics.view");
  if (actor.roleKey === "STUDENT") throw new ForbiddenError();
  const today = todayISO();
  const since = fromISODate(addCalendarDays(today, -30));

  const [students, activeCases, leadsNew, leadsAll, leadsConverted, pendingDocs, rejectedDocs, humanReview, payments, upcomingAppts, visaCases, scholarshipCases] = await Promise.all([
    db.student.count(),
    db.case.count({ where: { status: "ACTIVE" } }),
    db.lead.count({ where: { createdAt: { gte: since } } }),
    db.lead.count(),
    db.lead.count({ where: { status: { in: ["CONVERTED", "REGISTERED"] } } }),
    db.documentRequirementInstance.count({ where: { status: { in: ["UPLOADED", "UNDER_REVIEW"] }, requirement: { kind: "DOCUMENT" } } }),
    db.documentRequirementInstance.count({ where: { status: { in: ["REJECTED", "NEEDS_CORRECTION"] }, requirement: { kind: "DOCUMENT" } } }),
    db.case.count({ where: { requiresHumanReview: true } }),
    db.payment.findMany({ where: { status: { in: ["PENDING", "PARTIALLY_PAID", "LATE"] } }, include: { transactions: { select: { amountMinor: true } } } }),
    db.agencyAppointment.count({ where: { status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] }, startsAt: { gte: new Date() } } }),
    db.visaCase.count(),
    db.scholarshipApplication.count({ where: { status: { notIn: ["WITHDRAWN"] } } }),
  ]);

  // Outstanding amounts per currency
  const pendingByCurrency = new Map<string, number>();
  for (const p of payments) {
    const paid = p.transactions.reduce((s, t) => s + t.amountMinor, 0);
    pendingByCurrency.set(p.currency, (pendingByCurrency.get(p.currency) ?? 0) + Math.max(p.amountMinor - paid, 0));
  }

  const [studentRows, caseRows, docRows, transactions, staff] = await Promise.all([
    db.student.findMany({ select: { studyLanguage: true, desiredCity: { select: { name: true } }, cases: { select: { applications: { select: { university: { select: { name: true } }, status: true } } } } } }),
    db.case.findMany({ select: { currentStage: { select: { name: true, nameI18n: true, sortOrder: true } } } }),
    db.documentRequirementInstance.groupBy({ by: ["status"], where: { status: { not: "NOT_APPLICABLE" }, requirement: { kind: "DOCUMENT" } }, _count: true }),
    db.paymentTransaction.findMany({ select: { amountMinor: true, currency: true, paidAt: true } }),
    db.user.findMany({ where: { role: { key: "STAFF" }, active: true }, select: { name: true, assignments: { where: { active: true, case: { status: "ACTIVE" } }, select: { id: true } } } }),
  ]);

  const byCity = tally(studentRows.map((s) => s.desiredCity?.name ?? "—"));
  const byLanguage = tally(studentRows.map((s) => s.studyLanguage ?? "—"));
  const byUniversity = tally(studentRows.flatMap((s) => [...new Set(s.cases.flatMap((c) => c.applications.filter((a) => !["REJECTED", "WITHDRAWN"].includes(a.status)).map((a) => a.university.name)))]));
  const stageCounts = new Map<string, { label: string; order: number; value: number }>();
  for (const c of caseRows) {
    const key = c.currentStage.name;
    const cur = stageCounts.get(key) ?? { label: localized(c.currentStage.nameI18n, locale, key), order: c.currentStage.sortOrder, value: 0 };
    cur.value += 1;
    stageCounts.set(key, cur);
  }
  const byStage = [...stageCounts.values()].sort((a, b) => a.order - b.order).map(({ label, value }) => ({ label, value }));

  // Revenue per month, one series per currency (never combined)
  const revenue = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    const month = toISODate(t.paidAt).slice(0, 7);
    const cur = revenue.get(t.currency) ?? new Map<string, number>();
    cur.set(month, (cur.get(month) ?? 0) + t.amountMinor);
    revenue.set(t.currency, cur);
  }
  const revenueSeries = [...revenue.entries()].map(([currency, months]) => ({
    currency,
    points: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, minor]) => ({ month, minor })),
  }));

  return {
    kpis: {
      students,
      activeCases,
      leadsNew,
      conversionRate: leadsAll ? Math.round((leadsConverted / leadsAll) * 1000) / 10 : null,
      pendingDocs,
      rejectedDocs,
      humanReview,
      pendingPayments: payments.length,
      pendingByCurrency: [...pendingByCurrency.entries()].map(([currency, minor]) => ({ currency, minor })),
      upcomingAppts,
      visaCases,
      scholarshipCases,
    },
    byCity,
    byLanguage,
    byUniversity,
    byStage,
    docStatus: docRows.map((d) => ({ label: d.status, value: d._count })).sort((a, b) => b.value - a.value),
    revenueSeries,
    workload: staff.map((s) => ({ label: s.name, value: s.assignments.length })).sort((a, b) => b.value - a.value),
  };
}
