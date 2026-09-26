import { describe, expect, it } from "vitest";
import { italy2026Definition } from "../prisma/seed/procedure-data";
import { addMonths, addWorkingDays } from "../src/lib/dates";
import { computeDeadline, effectiveDeadline } from "../src/lib/engine/deadlines";
import { evaluateCase } from "../src/lib/engine/evaluate";
import { calculatePassport } from "../src/lib/engine/passport";
import { makeApplication, makeFacts } from "./helpers/facts";

const proc = italy2026Definition();
const holidays = new Set(proc.holidays.IT);

describe("passport validity (calculated requirement)", () => {
  const params = proc.parameters;
  it("15 months comes from the procedure version", () => {
    expect(calculatePassport({ passportExpiry: "2030-01-01", appointmentDate: "2026-10-10" }, params)!.monthsRequired).toBe(15);
    expect(calculatePassport({ passportExpiry: "2030-01-01" }, {})).toBeNull();
  });

  it("passes only when expiry is strictly after reference date + 15 months", () => {
    // reference 2026-10-10 → threshold 2028-01-10
    const at = calculatePassport({ passportExpiry: "2028-01-10", appointmentDate: "2026-10-10" }, params)!;
    expect(at.requiredValidUntilAfter).toBe("2028-01-10");
    expect(at.satisfied).toBe(false); // exactly on the boundary is not enough
    expect(calculatePassport({ passportExpiry: "2028-01-11", appointmentDate: "2026-10-10" }, params)!.satisfied).toBe(true);
    expect(calculatePassport({ passportExpiry: "2028-01-09", appointmentDate: "2026-10-10" }, params)!.satisfied).toBe(false);
  });

  it("uses the visa appointment date when known, otherwise the planned submission date", () => {
    const both = calculatePassport(
      { passportExpiry: "2028-02-01", appointmentDate: "2026-10-10", plannedSubmissionDate: "2026-12-01" },
      params,
    )!;
    expect(both.referenceSource).toBe("VISA_APPOINTMENT");
    expect(both.referenceDate).toBe("2026-10-10");
    const planned = calculatePassport({ passportExpiry: "2028-02-01", plannedSubmissionDate: "2026-12-01" }, params)!;
    expect(planned.referenceSource).toBe("PLANNED_SUBMISSION");
    expect(planned.satisfied).toBe(false); // 2026-12-01 + 15 months = 2028-03-01
  });

  it("is recomputed when the appointment date changes (instance stores reference date and result)", () => {
    const passportInstance = (appointment: string | null) => {
      const facts = makeFacts({
        student: { ...makeFacts().student, passportExpiry: "2028-01-20" },
        plannedSubmissionDate: null,
        applications: [
          makeApplication({
            status: "ACCEPTED",
            visa: appointment
              ? { stage: "APPOINTMENT_SCHEDULED", appointmentDate: appointment, programId: "p", intendedEnrollmentProgramId: "p" }
              : null,
          }),
        ],
      });
      return evaluateCase(facts, proc).instances.find((i) => i.requirementCode === "PASSPORT_VALIDITY")!;
    };
    const early = passportInstance("2026-10-10"); // threshold 2028-01-10 → ok
    expect(early.referenceDate).toBe("2026-10-10");
    expect(early.status).toBe("APPROVED");
    const late = passportInstance("2026-11-25"); // threshold 2028-02-25 → fails
    expect(late.referenceDate).toBe("2026-11-25");
    expect(late.status).toBe("NEEDS_CORRECTION");
    expect((late.calculation as { satisfied: boolean }).satisfied).toBe(false);
  });

  it("stays NOT_STARTED when the passport expiry date is unknown", () => {
    const facts = makeFacts({ student: { ...makeFacts().student, passportExpiry: null } });
    const inst = evaluateCase(facts, proc).instances.find((i) => i.requirementCode === "PASSPORT_VALIDITY")!;
    expect(inst.status).toBe("NOT_STARTED");
  });

  it("month arithmetic clamps to the end of the month", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-11-30", 3)).toBe("2028-02-29");
  });
});

describe("deadlines", () => {
  it("effective deadline = earliest of general, university, program (ignoring missing values)", () => {
    expect(effectiveDeadline("2026-11-30", "2026-10-15", "2026-11-01")).toBe("2026-10-15");
    expect(effectiveDeadline("2026-11-30", null, "2026-11-01")).toBe("2026-11-01");
    expect(effectiveDeadline("2026-11-30", undefined, undefined)).toBe("2026-11-30");
    expect(effectiveDeadline(null, null, null)).toBeNull();
  });

  it("engine applies the earliest of general / university / program per application", () => {
    const base = makeApplication();
    const app = makeApplication({
      university: { ...base.university, visaAppointmentDeadline: "2026-11-15" },
      program: { ...base.program, visaAppointmentDeadline: "2026-10-20" },
    });
    const r = evaluateCase(makeFacts({ applications: [app] }), proc);
    expect(r.deadlines.VISA_APPOINTMENT.date).toBe("2026-11-30");
    expect(r.effectiveAppointmentDeadlines[app.id]).toBe("2026-10-20");
    const form = r.instances.find((i) => i.requirementCode === "VISA_APPLICATION_FORM")!;
    expect(form.deadline).toBe("2026-10-20");
  });

  it("working days skip weekends", () => {
    // Monday 2026-09-28 + 5 working days = Monday 2026-10-05
    expect(addWorkingDays("2026-09-28", 5, new Set())).toBe("2026-10-05");
    // Friday + 1 = Monday
    expect(addWorkingDays("2026-10-02", 1, new Set())).toBe("2026-10-05");
    expect(addWorkingDays("2026-10-03", 0, new Set())).toBe("2026-10-03");
  });

  it("working days skip Italian holidays", () => {
    // Fri 2026-12-04 + 5 working days: Mon 7, Tue 8 (Immacolata, holiday), so Tue skipped → 7,9,10,11,14 → Mon 14 Dec
    expect(addWorkingDays("2026-12-04", 5, new Set())).toBe("2026-12-11");
    expect(addWorkingDays("2026-12-04", 5, holidays)).toBe("2026-12-14");
    // Easter Monday 2027-03-29 is skipped
    expect(addWorkingDays("2027-03-26", 1, holidays)).toBe("2027-03-30");
  });

  it("permesso: legal (8 working days) and conservative (8 calendar days) deadlines are both calculated", () => {
    const app = makeApplication({
      status: "ENROLLED",
      visa: { stage: "PASSPORT_RETURNED", arrivalDate: "2026-12-01", programId: "p", intendedEnrollmentProgramId: "p" },
    });
    const r = evaluateCase(makeFacts({ applications: [app] }), proc);
    // Tue 1 Dec + 8 calendar days
    expect(r.deadlines.PERMESSO_CONSERVATIVE.date).toBe("2026-12-09");
    expect(r.deadlines.PERMESSO_CONSERVATIVE.method).toBe("CALENDAR_DAYS");
    // working days after Tue 1 Dec: 2,3,4,7,(8 holiday),9,10,11,14 → 8th = Mon 14 Dec
    expect(r.deadlines.PERMESSO_LEGAL.date).toBe("2026-12-14");
    expect(r.deadlines.PERMESSO_LEGAL.method).toBe("WORKING_DAYS");
    expect(r.deadlines.PERMESSO_LEGAL.sourceName).toContain("286/1998");
  });

  it("no arrival date → permesso deadlines are unknown, not guessed", () => {
    const r = evaluateCase(makeFacts(), proc);
    expect(r.deadlines.PERMESSO_LEGAL.date).toBeNull();
    expect(r.deadlines.PERMESSO_CONSERVATIVE.date).toBeNull();
  });

  it("general deadlines are read from the procedure version (30 Nov 2026 and 31 Jan 2027)", () => {
    const r = evaluateCase(makeFacts(), proc);
    expect(r.deadlines.VISA_APPOINTMENT.date).toBe("2026-11-30");
    expect(r.deadlines.UNIVERSITALY_ENROLLMENT.date).toBe("2027-01-31");
    expect(r.deadlines.VISA_APPOINTMENT.reminderDates).toEqual(["2026-10-31", "2026-11-16", "2026-11-23", "2026-11-27", "2026-11-29"]);
  });

  it("computeDeadline supports fixed dates", () => {
    const d = computeDeadline(
      { code: "X", name: "x", scope: "GENERAL", kind: "FIXED_DATE", fixedDate: "2027-10-31", dayType: "CALENDAR_DAYS", reminderDays: [1], priority: "NORMAL" },
      null,
      new Set(),
    );
    expect(d.date).toBe("2027-10-31");
  });
});
