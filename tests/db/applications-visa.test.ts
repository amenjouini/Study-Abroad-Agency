import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { evaluateAndPersist } from "../../src/server/case-engine";
import { saveApplication, saveUniversitaly, saveVisa } from "../../src/server/student-data";
import { addFundingSource, setEurValue } from "../../src/server/student-data";
import { ForbiddenError, ValidationError } from "../../src/lib/errors";
import { authFor, caseOf, DB_AVAILABLE, instanceOf } from "../helpers/db";

describe.skipIf(!DB_AVAILABLE)("university applications", () => {
  it("a student can have several independent applications", async () => {
    const c = await caseOf("ahmed@student.test");
    const apps = await db.universityApplication.findMany({ where: { caseId: c.id }, include: { university: true } });
    expect(apps.length).toBeGreaterThanOrEqual(3);
    expect(new Set(apps.map((a) => a.universityId)).size).toBe(apps.length);
    expect(new Set(apps.map((a) => a.status)).size).toBeGreaterThan(1); // ACCEPTED, UNDER_EVALUATION, PLANNED
  });

  it("a student can add another application but cannot set the outcome status", async () => {
    const ines = await authFor("ines@student.test");
    const program = await db.universityProgram.findFirstOrThrow({ where: { name: "Data Science (MSc)" } });
    const id = await saveApplication(ines, { programId: program.id, status: "PLANNED" });
    expect(await db.universityApplication.findUnique({ where: { id } })).toMatchObject({ status: "PLANNED", programId: program.id });
    await expect(saveApplication(ines, { programId: program.id, status: "ACCEPTED" }, { applicationId: id })).rejects.toBeInstanceOf(ValidationError);
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("ines@student.test");
    await saveApplication(staff, { programId: program.id, status: "ACCEPTED", admissionResult: "Admitted" }, { caseId: c.id, applicationId: id });
    expect((await db.universityApplication.findUniqueOrThrow({ where: { id } })).status).toBe("ACCEPTED");
  });

  it("Universitaly and visa cases are attached to the right application", async () => {
    const c = await caseOf("youssef@student.test");
    const apps = await db.universityApplication.findMany({ where: { caseId: c.id }, include: { visa: true, universitaly: true, university: true } });
    const turin = apps.find((a) => a.university.name.includes("Torino"))!;
    const bologna = apps.find((a) => a.university.name.includes("Bologna"))!;
    expect(turin.status).toBe("ACCEPTED");
    expect(turin.visa).not.toBeNull();
    expect(turin.universitaly).not.toBeNull();
    expect(bologna.status).toBe("REJECTED");
    expect(bologna.visa).toBeNull();
    expect(bologna.universitaly).toBeNull();
    // the visa belongs to the application, not to the student: there is no student-level visa row
    expect(await db.visaCase.count({ where: { application: { caseId: c.id } } })).toBe(1);
  });

  it("a student can enter the Universitaly contact e-mail but not change the validation status", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const c = await caseOf("ahmed@student.test");
    const app = await db.universityApplication.findFirstOrThrow({ where: { caseId: c.id, universitaly: { isNot: null } } });
    await saveUniversitaly(ahmed, app.id, { contactEmail: "Ahmed.New@Example.com", status: "VALIDATED", transmittedToEmbassy: true });
    const uc = await db.universitalyCase.findUniqueOrThrow({ where: { applicationId: app.id } });
    expect(uc.contactEmail).toBe("ahmed.new@example.com");
    expect(uc.status).toBe("IN_PROGRESS"); // unchanged: staff-only fields ignored for students
    expect(uc.transmittedToEmbassy).toBe(false);
  });

  it("only staff can edit the visa case", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const c = await caseOf("ahmed@student.test");
    const app = await db.universityApplication.findFirstOrThrow({ where: { caseId: c.id, visa: { isNot: null } } });
    await expect(saveVisa(ahmed, app.id, { stage: "APPROVED" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!DB_AVAILABLE)("course / visa consistency", () => {
  it("flags visa.program ≠ intended enrollment program as a serious human-review issue, and clears it when fixed", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("youssef@student.test");
    const app = await db.universityApplication.findFirstOrThrow({ where: { caseId: c.id, visa: { isNot: null } } });
    const other = await db.universityProgram.findFirstOrThrow({ where: { name: "Computer Engineering (MSc)" } });

    await saveVisa(staff, app.id, { intendedEnrollmentProgramId: other.id });
    const flagged = await db.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(flagged.requiresHumanReview).toBe(true);
    expect(flagged.humanReviewPriority).toBe("HIGH");
    const item = await db.humanReviewItem.findFirstOrThrow({ where: { caseId: c.id, code: "VISA_PROGRAM_MISMATCH_REVIEW", status: { not: "RESOLVED" } } });
    expect(item.source).toBe("VISA_MISMATCH");
    expect(item.reason).toContain("returning to Tunisia for a new visa");
    expect((await instanceOf("youssef@student.test", "VISA_PROGRAM_MISMATCH_REVIEW", app.id)).status).toBe("REQUIRES_HUMAN_REVIEW");

    // fixing the consistency auto-resolves the engine-raised item (never deleted)
    await saveVisa(staff, app.id, { intendedEnrollmentProgramId: app.programId });
    expect((await db.humanReviewItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("RESOLVED");
    expect((await db.case.findUniqueOrThrow({ where: { id: c.id } })).requiresHumanReview).toBe(false);
  });
});

describe.skipIf(!DB_AVAILABLE)("passport check and permesso deadlines on real cases", () => {
  it("changing the visa appointment date recomputes the passport check and stores the reference date", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("youssef@student.test");
    const app = await db.universityApplication.findFirstOrThrow({ where: { caseId: c.id, visa: { isNot: null } } });
    // Passport expires 2027-06-01: fails against any 2026 appointment (needs > date + 15 months)
    expect((await instanceOf("youssef@student.test", "PASSPORT_VALIDITY")).status).toBe("NEEDS_CORRECTION");

    // Move the appointment far back: 2026-01-10 + 15 months = 2027-04-10 < 2027-06-01 → satisfied
    await saveVisa(staff, app.id, { appointmentAt: "2026-01-10T09:00:00Z" });
    const ok = await instanceOf("youssef@student.test", "PASSPORT_VALIDITY");
    expect(ok.status).toBe("APPROVED");
    expect(ok.referenceDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(ok.calculation).toMatchObject({ satisfied: true, referenceSource: "VISA_APPOINTMENT", monthsRequired: 15 });

    await saveVisa(staff, app.id, { appointmentAt: "2026-09-15T08:30:00Z" });
    const failing = await instanceOf("youssef@student.test", "PASSPORT_VALIDITY");
    expect(failing.status).toBe("NEEDS_CORRECTION");
    expect(failing.referenceDate?.toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("stores both permesso deadlines (legal and conservative) with method and source in the engine snapshot", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("sarra@student.test");
    const app = await db.universityApplication.findFirstOrThrow({ where: { caseId: c.id } });
    await saveVisa(staff, app.id, { arrivalDate: "2026-12-01", stage: "PASSPORT_RETURNED" });
    const snap = (await db.case.findUniqueOrThrow({ where: { id: c.id } })).engineSnapshot as { deadlines: Record<string, { date: string; method: string; sourceName: string }> };
    expect(snap.deadlines.PERMESSO_CONSERVATIVE).toMatchObject({ date: "2026-12-09", method: "CALENDAR_DAYS" });
    expect(snap.deadlines.PERMESSO_LEGAL).toMatchObject({ date: "2026-12-14", method: "WORKING_DAYS" });
    expect(snap.deadlines.PERMESSO_LEGAL.sourceName).toContain("286/1998");
  });
});

describe.skipIf(!DB_AVAILABLE)("funding on real cases", () => {
  it("Ines: 10,179.85 − 6,000 − 2,500 = shortfall 1,679.85 (the TND source counts only through the staff-entered EUR value)", async () => {
    const c = await caseOf("ines@student.test");
    const snap = (await db.case.findUniqueOrThrow({ where: { id: c.id } })).engineSnapshot as { funding: { required: { amountMinor: number }; available: { amountMinor: number }; shortfall: { amountMinor: number } } };
    expect(snap.funding.required.amountMinor).toBe(1017985);
    expect(snap.funding.available.amountMinor).toBe(850000);
    expect(snap.funding.shortfall.amountMinor).toBe(167985);
    const tnd = await db.fundingSource.findFirstOrThrow({ where: { caseId: c.id, currency: "TND" } });
    expect(tnd).toMatchObject({ amountMinor: 8_000_000, eurValueMinor: 250_000 });
    expect(tnd.convertedById).toBeTruthy();
    expect(tnd.exchangeRateDate).not.toBeNull();
  });

  it("a new TND source is not counted until staff enter its EUR value (no automatic conversion)", async () => {
    const ines = await authFor("ines@student.test");
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("ines@student.test");
    const id = await addFundingSource(ines, { type: "OTHER", description: "Cousin savings", amount: "3.000", currency: "TND" });
    let snap = (await db.case.findUniqueOrThrow({ where: { id: c.id } })).engineSnapshot as { funding: { shortfall: { amountMinor: number } } };
    expect(snap.funding.shortfall.amountMinor).toBe(167985); // unchanged
    expect(await db.humanReviewItem.count({ where: { caseId: c.id, code: "MISSING_EUR_VALUE", status: { not: "RESOLVED" } } })).toBe(1);

    await expect(setEurValue(ines, { fundingSourceId: id, eurAmount: "900.15", exchangeRate: "0.3", rateDate: "2026-09-20" })).rejects.toThrow();
    await setEurValue(staff, { fundingSourceId: id, eurAmount: "900.15", exchangeRate: "0.30005", rateDate: "2026-09-20" });
    snap = (await db.case.findUniqueOrThrow({ where: { id: c.id } })).engineSnapshot as { funding: { shortfall: { amountMinor: number } } };
    expect(snap.funding.shortfall.amountMinor).toBe(167985 - 90015);
    expect(await db.humanReviewItem.count({ where: { caseId: c.id, code: "MISSING_EUR_VALUE", status: { not: "RESOLVED" } } })).toBe(0);
    const src = await db.fundingSource.findUniqueOrThrow({ where: { id } });
    expect(src.convertedById).toBeTruthy();
    expect(src.exchangeRate?.toString()).toBe("0.30005");
  });

  it("amounts are validated with the currency's own decimals", async () => {
    const ines = await authFor("ines@student.test");
    await expect(addFundingSource(ines, { type: "OTHER", amount: "10.999", currency: "EUR" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addFundingSource(ines, { type: "OTHER", amount: "0", currency: "EUR" })).rejects.toBeInstanceOf(ValidationError);
    await expect(addFundingSource(ines, { type: "OTHER", amount: "abc", currency: "TND" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("re-running the engine on an unchanged case changes nothing", async () => {
    const c = await caseOf("sarra@student.test");
    const staff = await authFor("staff@agency.test");
    await evaluateAndPersist(c.id, { userId: staff.id, reason: "test" });
    const summary = await evaluateAndPersist(c.id, { userId: staff.id, reason: "test" });
    expect(summary.changed).toBe(false);
  });
});
