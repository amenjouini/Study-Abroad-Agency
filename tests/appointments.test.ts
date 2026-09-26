import { describe, expect, it } from "vitest";
import { generateSlots, zonedToUtc, type AppointmentSettings } from "../src/lib/appointments";
import { computePaymentStatus, nextPayment, summarizePayments } from "../src/lib/payments";

const settings: AppointmentSettings = {
  workingDays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "12:00",
  slotMinutes: 30,
  maxPerDay: 4,
  blockedDates: ["2026-10-07"],
  minNoticeHours: 12,
};
const TZ = "Africa/Tunis";
const now = new Date("2026-09-26T08:00:00Z");

describe("agency appointment slots", () => {
  it("converts agency wall-clock time to UTC (Tunis is UTC+1)", () => {
    expect(zonedToUtc("2026-10-05", "09:00", TZ).toISOString()).toBe("2026-10-05T08:00:00.000Z");
    // Rome observes DST: 9:00 in CEST is 07:00Z
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/Rome").toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("generates slots on working days within opening hours, capped by the daily maximum", () => {
    const slots = generateSlots("2026-10-05", settings, [], [], now, TZ); // Monday
    expect(slots.map((s) => s.label)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(generateSlots("2026-10-10", settings, [], [], now, TZ)).toEqual([]); // Saturday
  });

  it("respects blocked dates, blocked windows and already booked slots", () => {
    expect(generateSlots("2026-10-07", settings, [], [], now, TZ)).toEqual([]);
    const blocked = generateSlots("2026-10-05", { ...settings, maxPerDay: 10 }, [{ date: "2026-10-05", startTime: "09:30", endTime: "10:30", kind: "BLOCKED" }], [], now, TZ);
    expect(blocked.map((s) => s.label)).toEqual(["09:00", "10:30", "11:00", "11:30"]);
    const taken = [zonedToUtc("2026-10-05", "09:00", TZ)];
    expect(generateSlots("2026-10-05", { ...settings, maxPerDay: 10 }, [], taken, now, TZ).map((s) => s.label)).not.toContain("09:00");
  });

  it("no slots once the daily maximum is booked, none in the past or inside the notice window", () => {
    const full = ["09:00", "09:30", "10:00", "10:30"].map((t) => zonedToUtc("2026-10-05", t, TZ));
    expect(generateSlots("2026-10-05", settings, [], full, now, TZ)).toEqual([]);
    const late = new Date("2026-10-05T07:00:00Z"); // 08:00 Tunis: 9:00 slot is inside the 12h notice
    expect(generateSlots("2026-10-05", settings, [], [], late, TZ)).toEqual([]);
  });

  it("an explicit OPEN window can add availability on a non-working day", () => {
    const slots = generateSlots("2026-10-10", settings, [{ date: "2026-10-10", startTime: "10:00", endTime: "11:00", kind: "OPEN" }], [], now, TZ);
    expect(slots.map((s) => s.label)).toEqual(["10:00", "10:30"]);
  });
});

describe("payments (TND, never mixed with other currencies)", () => {
  it("derives the status from amounts and the due date", () => {
    const base = { amountMinor: 500_000, currency: "TND" };
    expect(computePaymentStatus({ ...base, paidMinor: 0, dueDate: "2026-12-01" }, "2026-09-26")).toBe("PENDING");
    expect(computePaymentStatus({ ...base, paidMinor: 200_000, dueDate: "2026-12-01" }, "2026-09-26")).toBe("PARTIALLY_PAID");
    expect(computePaymentStatus({ ...base, paidMinor: 500_000, dueDate: "2026-01-01" }, "2026-09-26")).toBe("PAID");
    expect(computePaymentStatus({ ...base, paidMinor: 200_000, dueDate: "2026-09-01" }, "2026-09-26")).toBe("LATE");
    expect(computePaymentStatus({ ...base, paidMinor: 0, dueDate: "2026-09-01", cancelled: true }, "2026-09-26")).toBe("CANCELLED");
  });

  it("summarises per currency and finds the next payment", () => {
    const list = [
      { amountMinor: 300_000, currency: "TND", paidMinor: 300_000, dueDate: "2026-08-01" },
      { amountMinor: 500_000, currency: "TND", paidMinor: 200_000, dueDate: "2026-10-01" },
      { amountMinor: 700_000, currency: "TND", paidMinor: 0, dueDate: "2026-12-01" },
      { amountMinor: 10_000, currency: "EUR", paidMinor: 0, dueDate: null },
    ];
    const totals = summarizePayments(list);
    const tnd = totals.find((t) => t.currency === "TND")!;
    expect(tnd.total.amountMinor).toBe(1_500_000);
    expect(tnd.paid.amountMinor).toBe(500_000);
    expect(tnd.remaining.amountMinor).toBe(1_000_000);
    expect(totals.find((t) => t.currency === "EUR")!.remaining.amountMinor).toBe(10_000);
    expect(totals).toHaveLength(2); // never merged
    expect(nextPayment(list)!.dueDate).toBe("2026-10-01");
  });
});
