import { z } from "zod";
import { db } from "@/lib/db";
import { generateSlots, type AppointmentSettings, type AvailabilityOverride } from "@/lib/appointments";
import { fromISODate, toISODate } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { authorizeCase, ownCaseId } from "@/server/case-access";
import { assignedStaffIds, notify, studentUserId } from "@/server/notifications";
import { rateLimit } from "@/server/rate-limit";

export const AGENCY_TZ = "Africa/Tunis";
const ACTIVE = ["REQUESTED", "CONFIRMED", "RESCHEDULED"] as const;

export async function loadSettings(): Promise<AppointmentSettings> {
  const s = await db.appointmentSetting.findFirst();
  if (!s) throw new NotFoundError("Appointment settings are not configured");
  return {
    workingDays: s.workingDays,
    startTime: s.startTime,
    endTime: s.endTime,
    slotMinutes: s.slotMinutes,
    maxPerDay: s.maxPerDay,
    blockedDates: s.blockedDates.map(toISODate),
    minNoticeHours: s.minNoticeHours,
  };
}

async function overridesFor(date: string): Promise<AvailabilityOverride[]> {
  const rows = await db.availabilitySlot.findMany({ where: { date: fromISODate(date) } });
  return rows.map((r) => ({ date: toISODate(r.date), startTime: r.startTime, endTime: r.endTime, kind: r.kind }));
}

/** Free slots of one day (agency calendar: one shared schedule for all staff). */
export async function availableSlots(date: string, now = new Date()) {
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  const settings = await loadSettings();
  const dayStart = new Date(`${date}T00:00:00Z`);
  const taken = await db.agencyAppointment.findMany({
    where: { status: { in: [...ACTIVE] }, startsAt: { gte: new Date(dayStart.getTime() - 86_400_000), lt: new Date(dayStart.getTime() + 2 * 86_400_000) } },
    select: { startsAt: true },
  });
  const takenSameDay = taken
    .map((t) => t.startsAt)
    .filter((d) => new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ }).format(d) === date);
  return generateSlots(date, settings, await overridesFor(date), takenSameDay, now, AGENCY_TZ);
}

const bookSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotStart: z.string().datetime(),
  type: z.enum(["GENERAL_CONSULTATION", "DOCUMENT_PROBLEM", "VISA_PROBLEM", "UNIVERSITY_PROBLEM", "SCHOLARSHIP_PROBLEM", "EMERGENCY", "OTHER"]),
  reason: z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  urgency: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

/** A student books a slot for a meeting WITH THE AGENCY (not the ALMAVIVA visa appointment). */
export async function bookAppointment(actor: AuthUser, input: unknown, caseId?: string) {
  const data = bookSchema.parse(input);
  const cid = actor.roleKey === "STUDENT" ? await ownCaseId(actor) : (caseId ?? (() => { throw new ValidationError("caseId is required"); })());
  await authorizeCase(actor, cid, { staff: "appointments.write", self: "self.appointments" });
  await rateLimit(`book:${actor.id}`, { limit: 10, windowSeconds: 3600 });

  const slots = await availableSlots(data.date);
  const slot = slots.find((s) => s.startsAt.toISOString() === new Date(data.slotStart).toISOString());
  if (!slot) throw new ConflictError("This slot is no longer available");

  const appointment = await db.$transaction(async (tx) => {
    // Re-check inside the transaction so two students cannot take the same slot
    const clash = await tx.agencyAppointment.findFirst({ where: { startsAt: slot.startsAt, status: { in: [...ACTIVE] } } });
    if (clash) throw new ConflictError("This slot is no longer available");
    const a = await tx.agencyAppointment.create({
      data: { caseId: cid, type: data.type, startsAt: slot.startsAt, endsAt: slot.endsAt, reason: data.reason, description: data.description, urgency: data.urgency, status: "REQUESTED" },
    });
    await writeAudit({ userId: actor.id, action: "appointment.create", entity: "AgencyAppointment", entityId: a.id, caseId: cid, metadata: { type: data.type, startsAt: slot.startsAt.toISOString() } }, tx);
    await writeTimeline({ caseId: cid, type: "appointment.created", title: "Agency appointment requested", detail: data.reason, actorId: actor.id }, tx);
    const staff = await assignedStaffIds(cid, tx);
    await notify(staff.map((userId) => ({ userId, caseId: cid, type: "appointment.requested", title: "New appointment request", body: data.reason, data: { reason: data.reason }, link: "/staff/appointments" })), tx);
    return a;
  });
  return appointment.id;
}

const TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED", "RESCHEDULED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED", "RESCHEDULED"],
  RESCHEDULED: ["CONFIRMED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Staff confirm, reschedule, complete, cancel or mark no-show. */
export async function updateAppointment(actor: AuthUser, appointmentId: string, input: { status: string; newStart?: string; ip?: string | null }) {
  const a = await db.agencyAppointment.findUnique({ where: { id: appointmentId } });
  if (!a) throw new NotFoundError();
  await requirePermission(actor, "appointments.write", { caseId: a.caseId });
  if (actor.roleKey === "STUDENT") throw new ForbiddenError();
  if (!TRANSITIONS[a.status]?.includes(input.status)) throw new ConflictError(`Cannot change from ${a.status} to ${input.status}`);
  let startsAt = a.startsAt;
  let endsAt = a.endsAt;
  if (input.status === "RESCHEDULED") {
    if (!input.newStart) throw new ValidationError("A new date and time is required");
    startsAt = new Date(input.newStart);
    endsAt = new Date(startsAt.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()));
  }
  const student = await studentUserId(a.caseId);
  await db.$transaction(async (tx) => {
    await tx.agencyAppointment.update({ where: { id: a.id }, data: { status: input.status as never, startsAt, endsAt, staffUserId: a.staffUserId ?? actor.id } });
    await writeAudit({ userId: actor.id, action: "appointment.update", entity: "AgencyAppointment", entityId: a.id, caseId: a.caseId, ip: input.ip, metadata: { from: a.status, to: input.status } }, tx);
    await writeTimeline({ caseId: a.caseId, type: "appointment.updated", title: `Agency appointment ${input.status.toLowerCase().replace("_", " ")}`, detail: a.reason, actorId: actor.id }, tx);
    await notify({ userId: student, caseId: a.caseId, type: `appointment.${input.status.toLowerCase()}`, title: "Appointment update", body: a.reason, data: { status: input.status, startsAt: startsAt.toISOString() }, link: "/student/appointments" }, tx);
  });
}

export async function cancelOwnAppointment(actor: AuthUser, appointmentId: string) {
  const a = await db.agencyAppointment.findUnique({ where: { id: appointmentId } });
  if (!a) throw new NotFoundError();
  await requirePermission(actor, "self.appointments", { caseId: a.caseId });
  if (!["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(a.status)) throw new ConflictError("This appointment can no longer be cancelled");
  await db.$transaction(async (tx) => {
    await tx.agencyAppointment.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
    await writeAudit({ userId: actor.id, action: "appointment.cancel", entity: "AgencyAppointment", entityId: a.id, caseId: a.caseId }, tx);
    await writeTimeline({ caseId: a.caseId, type: "appointment.updated", title: "Agency appointment cancelled", detail: a.reason, actorId: actor.id }, tx);
  });
}

const settingsSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(10).max(240),
  maxPerDay: z.number().int().min(1).max(200),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400),
  minNoticeHours: z.number().int().min(0).max(240),
});

/** Admin: working days, hours, duration, blocked dates, maximum per day. */
export async function saveAppointmentSettings(actor: AuthUser, input: unknown) {
  await requirePermission(actor, "appointments.settings");
  const data = settingsSchema.parse(input);
  if (data.startTime >= data.endTime) throw new ValidationError("Opening time must be before closing time");
  const existing = await db.appointmentSetting.findFirst();
  const values = { ...data, blockedDates: data.blockedDates.map(fromISODate) };
  if (existing) await db.appointmentSetting.update({ where: { id: existing.id }, data: values });
  else await db.appointmentSetting.create({ data: values });
  await writeAudit({ userId: actor.id, action: "settings.appointments_update", entity: "AppointmentSetting", metadata: data });
}
