import { db } from "@/lib/db";
import { addCalendarDays, diffDays, fromISODate, todayISO, toISODate } from "@/lib/dates";
import { assignedStaffIds, notify, studentUserId } from "@/server/notifications";

async function alreadySent(userId: string, type: string, key: string): Promise<boolean> {
  const found = await db.notification.findFirst({ where: { userId, type, data: { path: ["key"], equals: key } }, select: { id: true } });
  return !!found;
}

/**
 * Deadline / payment / appointment reminders. Idempotent: each reminder carries a key and is created once.
 * Run it from a scheduler (see /api/cron/reminders); no provider is hard-coded — delivery goes through NotificationChannel.
 */
export async function runReminders(now: Date = new Date()): Promise<{ created: number }> {
  const today = todayISO(now);
  let created = 0;
  const send = async (userId: string, caseId: string, type: string, key: string, title: string, data: Record<string, string | number>, link: string) => {
    if (await alreadySent(userId, type, key)) return;
    await notify({ userId, caseId, type, title, data: { ...data, key }, link });
    created++;
  };

  // 1. Requirement deadlines: reminder days come from the procedure deadline (default 30, 14, 7, 3, 1)
  const deadlines = await db.procedureDeadline.findMany({ select: { procedureVersionId: true, code: true, reminderDays: true } });
  const remindersFor = (versionId: string, code: string | null) => deadlines.find((d) => d.procedureVersionId === versionId && d.code === code)?.reminderDays ?? [30, 14, 7, 3, 1];
  const instances = await db.documentRequirementInstance.findMany({
    where: { deadline: { gte: fromISODate(today) }, status: { notIn: ["APPROVED", "NOT_APPLICABLE"] }, requirement: { kind: "DOCUMENT" }, case: { status: "ACTIVE" } },
    include: { requirement: { select: { name: true, deadlineCode: true } }, case: { select: { id: true, procedureVersionId: true } } },
  });
  for (const i of instances) {
    const days = diffDays(toISODate(i.deadline!), today);
    if (!remindersFor(i.case.procedureVersionId, i.requirement.deadlineCode).includes(days)) continue;
    const student = await studentUserId(i.caseId);
    await send(student, i.caseId, "deadline.approaching", `deadline:${i.id}:${days}`, "Deadline approaching", { requirement: i.requirement.name, days, date: toISODate(i.deadline!) }, "/student/documents");
  }

  // 2. Payments due within 3 days (or today)
  const payments = await db.payment.findMany({
    where: { status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { gte: fromISODate(today), lte: fromISODate(addCalendarDays(today, 3)) } },
    select: { id: true, name: true, caseId: true, dueDate: true },
  });
  for (const p of payments) {
    await send(await studentUserId(p.caseId), p.caseId, "payment.due", `payment:${p.id}:${toISODate(p.dueDate!)}`, "Payment due", { payment: p.name, date: toISODate(p.dueDate!) }, "/student/payments");
  }

  // 3. Agency appointments tomorrow (student and assigned staff)
  const from = new Date(now.getTime() + 12 * 3_600_000);
  const to = new Date(now.getTime() + 36 * 3_600_000);
  const appts = await db.agencyAppointment.findMany({ where: { status: { in: ["CONFIRMED"] }, startsAt: { gte: from, lte: to } }, select: { id: true, caseId: true, reason: true, startsAt: true } });
  for (const a of appts) {
    const recipients = [await studentUserId(a.caseId), ...(await assignedStaffIds(a.caseId))];
    for (const userId of recipients) await send(userId, a.caseId, "appointment.tomorrow", `appt:${a.id}`, "Appointment tomorrow", { reason: a.reason, startsAt: a.startsAt.toISOString() }, "/student/appointments");
  }
  return { created };
}
