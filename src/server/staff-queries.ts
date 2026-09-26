import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addCalendarDays, fromISODate, todayISO } from "@/lib/dates";
import { caseAccessWhere, type AuthUser } from "@/server/authz";

export interface CaseFilters {
  q?: string;
  staffId?: string;
  cityId?: string;
  universityId?: string;
  stage?: string;
  priority?: string;
  docStatus?: string;
  visaStage?: string;
  scholarshipStatus?: string;
  paymentStatus?: string;
  review?: boolean;
}

/**
 * Global search: student name, phone, e-mail, passport number, application id, payment reference,
 * university, case number. Every whitespace-separated token must match at least one of these.
 */
function searchWhere(q: string): Prisma.CaseWhereInput[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const like = { contains: token, mode: "insensitive" as const };
      return {
        OR: [
          { caseNumber: like },
          { student: { firstName: like } },
          { student: { lastName: like } },
          { student: { phone: like } },
          { student: { passportNumber: like } },
          { student: { user: { email: like } } },
          { applications: { some: { id: token } } },
          { applications: { some: { university: { name: like } } } },
          { payments: { some: { transactions: { some: { reference: like } } } } },
        ],
      };
    });
}

export async function buildCaseWhere(actor: AuthUser, filters: CaseFilters, permission = "students.read"): Promise<Prisma.CaseWhereInput> {
  const and: Prisma.CaseWhereInput[] = [await caseAccessWhere(actor, permission)];
  if (filters.q) and.push(...searchWhere(filters.q));
  if (filters.staffId) and.push({ assignments: { some: { userId: filters.staffId, active: true } } });
  if (filters.cityId) and.push({ student: { desiredCityId: filters.cityId } });
  if (filters.universityId) and.push({ applications: { some: { universityId: filters.universityId } } });
  if (filters.stage) and.push({ currentStage: { key: filters.stage } });
  if (filters.priority) and.push({ humanReviewPriority: filters.priority as never });
  if (filters.review) and.push({ requiresHumanReview: true });
  if (filters.docStatus) and.push({ instances: { some: { status: filters.docStatus as never } } });
  if (filters.visaStage) and.push({ applications: { some: { visa: { stage: filters.visaStage as never } } } });
  if (filters.scholarshipStatus) and.push({ scholarshipApps: { some: { status: filters.scholarshipStatus as never } } });
  if (filters.paymentStatus) and.push({ payments: { some: { status: filters.paymentStatus as never } } });
  return { AND: and };
}

export async function listCases(actor: AuthUser, filters: CaseFilters, opts: { take?: number; skip?: number } = {}) {
  const where = await buildCaseWhere(actor, filters);
  const [rows, total] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ requiresHumanReview: "desc" }, { humanReviewPriority: "desc" }, { updatedAt: "desc" }],
      take: opts.take ?? 25,
      skip: opts.skip ?? 0,
      include: {
        student: { include: { user: { select: { email: true } }, desiredCity: true } },
        currentStage: true,
        assignments: { where: { active: true }, include: { user: { select: { id: true, name: true } } } },
        applications: { include: { university: true, visa: true }, orderBy: { createdAt: "asc" } },
        payments: { select: { status: true } },
        _count: { select: { instances: { where: { status: { in: ["UPLOADED", "UNDER_REVIEW"] } } } } },
      },
    }),
    db.case.count({ where }),
  ]);
  return { rows, total };
}

/** Staff dashboard: everything comes from the database, scoped to the cases the actor may access. */
export async function getStaffDashboard(actor: AuthUser, filters: CaseFilters) {
  const caseWhere = await buildCaseWhere(actor, filters);
  const today = todayISO();
  const soon = fromISODate(addCalendarDays(today, 14));
  const [review, awaiting, rejected, appointments, urgentTasks, latePayments, deadlines, activeCases] = await Promise.all([
    db.humanReviewItem.findMany({
      where: { status: { not: "RESOLVED" }, case: caseWhere },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 15,
      include: { case: { include: { student: true } } },
    }),
    db.documentRequirementInstance.findMany({
      where: { status: { in: ["UPLOADED", "UNDER_REVIEW"] }, requirement: { kind: "DOCUMENT" }, case: caseWhere },
      orderBy: { updatedAt: "asc" },
      take: 12,
      include: { requirement: true, case: { include: { student: true } } },
    }),
    db.documentRequirementInstance.findMany({
      where: { status: { in: ["REJECTED", "NEEDS_CORRECTION"] }, requirement: { kind: "DOCUMENT" }, case: caseWhere },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { requirement: true, case: { include: { student: true } } },
    }),
    db.agencyAppointment.findMany({
      where: { status: { in: ["REQUESTED", "CONFIRMED", "RESCHEDULED"] }, startsAt: { gte: new Date() }, case: caseWhere },
      orderBy: { startsAt: "asc" },
      take: 8,
      include: { case: { include: { student: true } } },
    }),
    db.task.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "URGENT"] }, case: caseWhere, ...(actor.roleKey === "STAFF" ? { assignee: { userId: actor.id } } : {}) },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 8,
      include: { case: { include: { student: true } } },
    }),
    db.payment.findMany({
      where: { status: "LATE", case: caseWhere },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { case: { include: { student: true } } },
    }),
    db.documentRequirementInstance.findMany({
      where: { deadline: { gte: fromISODate(today), lte: soon }, status: { notIn: ["APPROVED", "NOT_APPLICABLE"] }, requirement: { kind: "DOCUMENT" }, case: caseWhere },
      orderBy: { deadline: "asc" },
      take: 8,
      include: { requirement: true, case: { include: { student: true } } },
    }),
    db.case.count({ where: { AND: [caseWhere, { status: "ACTIVE" }] } }),
  ]);
  return { review, awaiting, rejected, appointments, urgentTasks, latePayments, deadlines, activeCases };
}

export async function filterOptions(actor: AuthUser) {
  const [cities, universities, stages, staff] = await Promise.all([
    db.city.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.university.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.caseStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { key: true, name: true } }),
    actor.roleKey === "STAFF" ? Promise.resolve([]) : db.user.findMany({ where: { role: { key: { in: ["STAFF", "ADMIN", "OWNER"] } }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { cities, universities, stages, staff };
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): CaseFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  return {
    q: one("q"),
    staffId: one("staff"),
    cityId: one("city"),
    universityId: one("university"),
    stage: one("stage"),
    priority: one("priority"),
    docStatus: one("doc"),
    visaStage: one("visa"),
    scholarshipStatus: one("scholarship"),
    paymentStatus: one("payment"),
    review: one("review") === "1",
  };
}
