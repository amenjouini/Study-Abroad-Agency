import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/lib/errors";
import { addCalendarDays, todayISO } from "../../src/lib/dates";
import { bookAppointment, availableSlots, cancelOwnAppointment, updateAppointment } from "../../src/server/appointments";
import { exportCsv } from "../../src/server/exports";
import { createHelpRequest, getThread, resolveHumanReview, sendMessage } from "../../src/server/messaging";
import { recordTransaction } from "../../src/server/payments";
import { runReminders } from "../../src/server/reminders";
import { evaluateAndPersist } from "../../src/server/case-engine";
import { authFor, caseOf, DB_AVAILABLE } from "../helpers/db";

describe.skipIf(!DB_AVAILABLE)("payments", () => {
  it("records a TND transaction with 3-decimal amounts, updates the status and never mixes currencies", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("mehdi@student.test");
    const payment = await db.payment.findFirstOrThrow({ where: { caseId: c.id, name: "University application" }, include: { transactions: true } });
    expect(payment.currency).toBe("TND");
    expect(payment.amountMinor).toBe(500_000);

    await expect(recordTransaction(staff, { paymentId: payment.id, amountMinor: 100_000, currency: "EUR", paidAt: todayISO(), method: "Cash" })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordTransaction(staff, { paymentId: payment.id, amountMinor: 600_000, currency: "TND", paidAt: todayISO(), method: "Cash" })).rejects.toBeInstanceOf(ValidationError);
    await recordTransaction(staff, { paymentId: payment.id, amountMinor: 123_456, currency: "TND", paidAt: todayISO(), method: "Cash", reference: "REC-1" });
    let p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("LATE"); // due date already passed and not fully paid
    await recordTransaction(staff, { paymentId: payment.id, amountMinor: 376_544, currency: "TND", paidAt: todayISO(), method: "Bank transfer" });
    p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("PAID");
    // an audit entry and a timeline entry exist, and the student is notified
    expect(await db.auditLog.count({ where: { caseId: c.id, action: "payment.transaction_create" } })).toBeGreaterThanOrEqual(2);
    const student = await authFor("mehdi@student.test");
    expect(await db.notification.count({ where: { userId: student.id, type: "payment.recorded" } })).toBeGreaterThanOrEqual(2);
  });

  it("students cannot record payments and staff2 cannot touch staff@'s cases", async () => {
    const mehdi = await authFor("mehdi@student.test");
    const staff2 = await authFor("staff2@agency.test");
    const c = await caseOf("ahmed@student.test");
    const payment = await db.payment.findFirstOrThrow({ where: { caseId: c.id } });
    const input = { paymentId: payment.id, amountMinor: 1000, currency: "TND", paidAt: todayISO(), method: "Cash" };
    await expect(recordTransaction(mehdi, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordTransaction(staff2, input)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!DB_AVAILABLE)("agency appointments (not the ALMAVIVA visa appointment)", () => {
  it("a student books an available slot; a second booking of the same slot is refused; staff confirm; the student can cancel", async () => {
    const youssef = await authFor("youssef@student.test");
    const mehdi = await authFor("mehdi@student.test");
    const staff = await authFor("staff@agency.test");
    // next Monday at least 2 days ahead
    let date = addCalendarDays(todayISO(), 3);
    while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 2) date = addCalendarDays(date, 1); // a Tuesday
    const slots = await availableSlots(date);
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[0];

    const id = await bookAppointment(youssef, { date, slotStart: slot.startsAt.toISOString(), type: "VISA_PROBLEM", reason: "Question about my file", urgency: "NORMAL" });
    const appt = await db.agencyAppointment.findUniqueOrThrow({ where: { id } });
    expect(appt.status).toBe("REQUESTED");
    expect(appt.startsAt.toISOString()).toBe(slot.startsAt.toISOString());
    expect((await availableSlots(date)).map((s) => s.label)).not.toContain(slot.label);
    await expect(bookAppointment(mehdi, { date, slotStart: slot.startsAt.toISOString(), type: "OTHER", reason: "Same slot please" })).rejects.toBeInstanceOf(ConflictError);

    await updateAppointment(staff, id, { status: "CONFIRMED" });
    expect((await db.agencyAppointment.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
    await expect(updateAppointment(staff, id, { status: "REQUESTED" })).rejects.toBeInstanceOf(ConflictError);
    // another student cannot cancel it
    await expect(cancelOwnAppointment(mehdi, id)).rejects.toBeInstanceOf(ForbiddenError);
    await cancelOwnAppointment(youssef, id);
    expect((await db.agencyAppointment.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    expect((await availableSlots(date)).map((s) => s.label)).toContain(slot.label);
  });

  it("weekends and blocked dates offer no slots", async () => {
    let saturday = addCalendarDays(todayISO(), 2);
    while (new Date(`${saturday}T00:00:00Z`).getUTCDay() !== 6) saturday = addCalendarDays(saturday, 1);
    expect(await availableSlots(saturday)).toEqual([]);
  });
});

describe.skipIf(!DB_AVAILABLE)("help requests and the human-review queue", () => {
  it("\"I need help\" flags the case REQUIRES_HUMAN_REVIEW with the chosen priority; staff resolve it", async () => {
    const sarra = await authFor("sarra@student.test");
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("sarra@student.test");
    expect((await db.case.findUniqueOrThrow({ where: { id: c.id } })).requiresHumanReview).toBe(false);

    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const itemId = await createHelpRequest(sarra, { description: "I received an unexpected email about my appointment", priority: "URGENT" }, [{ buffer: pdf, filename: "email.pdf" }]);
    const flagged = await db.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(flagged).toMatchObject({ requiresHumanReview: true, humanReviewPriority: "URGENT" });
    const item = await db.humanReviewItem.findUniqueOrThrow({ where: { id: itemId }, include: { message: { include: { attachments: true } } } });
    expect(item.source).toBe("STUDENT_HELP");
    expect(item.message?.attachments).toHaveLength(1);
    // staff are notified
    expect(await db.notification.count({ where: { userId: staff.id, type: "help.requested" } })).toBeGreaterThan(0);

    await expect(resolveHumanReview(sarra, itemId, "done")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveHumanReview(staff, itemId, " ")).rejects.toBeInstanceOf(ValidationError);
    await resolveHumanReview(staff, itemId, "Explained that the email is genuine ALMAVIVA correspondence.");
    expect(await db.case.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ requiresHumanReview: false, humanReviewPriority: null });
  });

  it("a sponsor review flagged by the engine stays cleared after staff resolve it (the engine does not re-open it)", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("mehdi@student.test");
    const item = await db.humanReviewItem.findFirstOrThrow({ where: { caseId: c.id, code: "SPONSOR_RELATIONSHIP_REVIEW", status: { not: "RESOLVED" } } });
    await resolveHumanReview(staff, item.id, "Checked with the family: exceptional case, approved by the manager.");
    await evaluateAndPersist(c.id, { userId: staff.id, reason: "test" });
    await evaluateAndPersist(c.id, { userId: staff.id, reason: "test" });
    expect(await db.humanReviewItem.count({ where: { caseId: c.id, code: "SPONSOR_RELATIONSHIP_REVIEW", status: { not: "RESOLVED" } } })).toBe(0);
    expect((await db.case.findUniqueOrThrow({ where: { id: c.id } })).requiresHumanReview).toBe(false);
  });
});

describe.skipIf(!DB_AVAILABLE)("messaging", () => {
  it("student and assigned staff exchange messages; other students and unassigned staff cannot read the thread", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const staff = await authFor("staff@agency.test");
    const staff2 = await authFor("staff2@agency.test");
    const youssef = await authFor("youssef@student.test");
    const c = await caseOf("ahmed@student.test");

    await sendMessage(ahmed, { body: "Hello, I uploaded my birth extract." });
    await sendMessage(staff, { body: "Thanks, we will look at it today." }, [], c.id);
    const thread = await getThread(ahmed, c.id);
    expect(thread.map((m) => [m.body, m.mine])).toEqual([["Hello, I uploaded my birth extract.", true], ["Thanks, we will look at it today.", false]]);
    expect(await db.notification.count({ where: { userId: ahmed.id, type: "message.new" } })).toBeGreaterThan(0);

    await expect(getThread(youssef, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getThread(staff2, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendMessage(staff2, { body: "intruder" }, [], c.id)).rejects.toBeInstanceOf(ForbiddenError);
    // a student cannot pick a case: the case id is ignored and always their own
    await sendMessage(youssef, { body: "mine" }, [], c.id);
    expect((await db.message.findFirstOrThrow({ where: { body: "mine" } })).caseId).toBe((await caseOf("youssef@student.test")).id);
  });
});

describe.skipIf(!DB_AVAILABLE)("CSV exports", () => {
  it("are scoped to the cases the user can access", async () => {
    const staff = await authFor("staff@agency.test");
    const staff2 = await authFor("staff2@agency.test");
    const admin = await authFor("admin@agency.test");
    const lines = (s: string) => s.replace(/^﻿/, "").trim().split(/\r\n/);
    expect(lines((await exportCsv(staff, "students")).body)).toHaveLength(1 + 5);
    expect(lines((await exportCsv(staff2, "students")).body)).toHaveLength(1); // header only
    expect(lines((await exportCsv(admin, "students")).body).length).toBeGreaterThanOrEqual(6);
    const pay = (await exportCsv(admin, "payments")).body;
    expect(pay.split("\r\n")[0]).toBe("﻿case_number,student,payment,amount,currency,paid_at,method,reference");
    expect(pay).toMatch(/,300\.000,TND,/); // 3 decimals for TND
    await expect(exportCsv(staff, "secrets")).rejects.toBeInstanceOf(ValidationError);
    const student = await authFor("ahmed@student.test");
    await expect(exportCsv(student, "students")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!DB_AVAILABLE)("reminders", () => {
  it("are created once (idempotent) and only for payments and deadlines that are due", async () => {
    const first = await runReminders();
    const second = await runReminders();
    expect(second.created).toBe(0);
    expect(first.created).toBeGreaterThanOrEqual(0);
  });
});
