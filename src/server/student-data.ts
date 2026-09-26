import { db } from "@/lib/db";
import { fromISODate } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { money, parseMoney } from "@/lib/money";
import {
  academicSchema,
  applicationSchema,
  citySchema,
  eurValueSchema,
  fundingSourceSchema,
  languageSchema,
  personalSchema,
  programChoiceSchema,
  scholarshipChoiceSchema,
  sponsorSchema,
  sponsorStatusSchema,
  universitalySchema,
  visaSchema,
} from "@/lib/validation/domain";
import { audit, mutateCase, ownCaseId } from "@/server/case-access";
import { changeCaseStage } from "@/server/cases";
import { requirePermission, type AuthUser } from "@/server/authz";

const STAFF_STUDENTS = { staff: "students.write", self: "self.profile" } as const;
const FUNDING = { staff: "funding.write", self: "self.profile" } as const;
const APPLICATIONS = { staff: "applications.write", self: "self.profile" } as const;

/** Resolve the target case: students always act on their own case; staff pass an explicit case id. */
async function targetCase(actor: AuthUser, caseId?: string): Promise<string> {
  return actor.roleKey === "STUDENT" ? ownCaseId(actor) : (caseId ?? Promise.reject(new ValidationError("caseId is required")));
}

async function studentOfCase(caseId: string) {
  const c = await db.case.findUnique({ where: { id: caseId }, select: { studentId: true } });
  if (!c) throw new NotFoundError("Case not found");
  return c.studentId;
}

// ───────────── Wizard steps 1–3: profile ─────────────

export async function savePersonal(actor: AuthUser, input: unknown, caseId?: string) {
  const data = personalSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.personal", async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        dateOfBirth: fromISODate(data.dateOfBirth),
        gender: data.gender,
        passportNumber: data.passportNumber.toUpperCase(),
        passportExpiry: fromISODate(data.passportExpiry),
        address: data.address,
      },
    });
    await audit(actor, tx, "student.update", "Student", studentId, cid, { section: "personal" });
  });
}

export async function saveLanguage(actor: AuthUser, input: unknown, caseId?: string) {
  const data = languageSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.language", async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        studyLanguage: data.studyLanguage,
        languageLevel: data.languageLevel ?? null,
        languageCertificate: data.languageCertificate ?? null,
        languageCertificateLevel: data.languageCertificateLevel ?? null,
        languageCertificateExpiry: data.languageCertificateExpiry ? fromISODate(data.languageCertificateExpiry) : null,
      },
    });
    await audit(actor, tx, "student.update", "Student", studentId, cid, { section: "language" });
  });
}

export async function saveAcademic(actor: AuthUser, input: unknown, caseId?: string) {
  const data = academicSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.academic", async (tx) => {
    await tx.student.update({
      where: { id: studentId },
      data: {
        bacYear: data.bacYear,
        bacSection: data.bacSection,
        bacGrade: data.bacGrade,
        desiredDegreeLevel: data.desiredDegreeLevel,
        declarationStatus: data.declarationStatus,
        cimeaStatus: data.cimeaStatus,
      },
    });
    await tx.studentDegree.deleteMany({ where: { studentId } });
    if (data.degrees.length) {
      await tx.studentDegree.createMany({
        data: data.degrees.map((d) => ({ studentId, level: d.level, title: d.title, institution: d.institution, year: d.year, grade: d.grade })),
      });
    }
    await audit(actor, tx, "student.update", "Student", studentId, cid, { section: "academic" });
  });
}

// ───────────── Steps 4–6: city, program, scholarship ─────────────

export async function saveCity(actor: AuthUser, input: unknown, caseId?: string) {
  const { cityId } = citySchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  if (!(await db.city.findUnique({ where: { id: cityId }, select: { id: true } }))) throw new NotFoundError("City not found");
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.city", async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { desiredCityId: cityId } });
  });
}

/** Choose the main program: creates (or updates) the student's primary PLANNED application. */
export async function saveProgramChoice(actor: AuthUser, input: unknown, caseId?: string) {
  const { programId } = programChoiceSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  const program = await db.universityProgram.findUnique({ where: { id: programId, active: true }, include: { university: true } });
  if (!program) throw new NotFoundError("Program not found");
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.program", async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { desiredProgramId: programId } });
    const existing = await tx.universityApplication.findFirst({ where: { caseId: cid, programId } });
    if (!existing) {
      const app = await tx.universityApplication.create({
        data: {
          caseId: cid,
          programId,
          universityId: program.universityId,
          academicYearId: program.academicYearId,
          status: "PLANNED",
          deadline: program.applicationDeadline,
          applicationFeeMinor: program.applicationFeeMinor,
          applicationFeeCurrency: program.applicationFeeCurrency,
        },
      });
      await audit(actor, tx, "application.create", "UniversityApplication", app.id, cid, { programId });
    }
  });
}

export async function saveScholarshipChoice(actor: AuthUser, input: unknown, caseId?: string) {
  const data = scholarshipChoiceSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  return mutateCase(actor, cid, STAFF_STUDENTS, "student.scholarship", async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { wantsScholarship: data.wantsScholarship } });
    if (data.wantsScholarship && data.scholarshipVersionId) {
      const version = await tx.scholarshipVersion.findUnique({ where: { id: data.scholarshipVersionId } });
      if (!version) throw new NotFoundError("Scholarship not found");
      const exists = await tx.scholarshipApplication.findFirst({ where: { caseId: cid, scholarshipVersionId: version.id } });
      if (!exists) {
        const sa = await tx.scholarshipApplication.create({ data: { caseId: cid, scholarshipVersionId: version.id, status: "PLANNED" } });
        await audit(actor, tx, "scholarship_application.create", "ScholarshipApplication", sa.id, cid);
      }
    }
  });
}

// ───────────── Step 7: funding sources ─────────────

export async function addFundingSource(actor: AuthUser, input: unknown, caseId?: string) {
  const data = fundingSourceSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const amount = (() => {
    try {
      return parseMoney(data.amount, data.currency);
    } catch (e) {
      throw new ValidationError((e as Error).message, { amount: [(e as Error).message] });
    }
  })();
  if (amount.amountMinor <= 0) throw new ValidationError("Amount must be positive", { amount: ["positive"] });
  return mutateCase(actor, cid, FUNDING, "funding.add", async (tx) => {
    let scholarshipApplicationId: string | undefined;
    if (data.type === "SCHOLARSHIP") {
      // Link to the student's (single) scholarship application when there is one
      const apps = await tx.scholarshipApplication.findMany({ where: { caseId: cid, status: { notIn: ["REJECTED", "WITHDRAWN"] } }, take: 2 });
      if (apps.length === 1) scholarshipApplicationId = apps[0].id;
    }
    const src = await tx.fundingSource.create({
      data: {
        caseId: cid,
        type: data.type,
        description: data.description,
        sourceOfFunds: data.sourceOfFunds,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        scholarshipApplicationId,
      },
    });
    await audit(actor, tx, "funding.create", "FundingSource", src.id, cid, { type: data.type, currency: amount.currency, amountMinor: amount.amountMinor });
    return src.id;
  });
}

export async function removeFundingSource(actor: AuthUser, fundingSourceId: string) {
  const src = await db.fundingSource.findUnique({ where: { id: fundingSourceId }, select: { caseId: true, sponsorId: true, type: true } });
  if (!src) throw new NotFoundError();
  return mutateCase(actor, src.caseId, FUNDING, "funding.remove", async (tx) => {
    await tx.fundingAllocation.deleteMany({ where: { fundingSourceId } });
    await tx.fundingSource.delete({ where: { id: fundingSourceId } });
    if (src.sponsorId) {
      const remaining = await tx.fundingSource.count({ where: { sponsorId: src.sponsorId } });
      if (remaining === 0) await tx.sponsor.delete({ where: { id: src.sponsorId } });
    }
    await audit(actor, tx, "funding.delete", "FundingSource", fundingSourceId, src.caseId);
  });
}

/**
 * Staff-only: a non-EUR source counts toward the EUR requirement only through a staff-entered EUR value,
 * with exchange rate, rate date and the staff member recorded. No automatic conversion.
 */
export async function setEurValue(actor: AuthUser, input: unknown) {
  const data = eurValueSchema.parse(input);
  const src = await db.fundingSource.findUnique({ where: { id: data.fundingSourceId } });
  if (!src) throw new NotFoundError();
  await requirePermission(actor, "funding.write", { caseId: src.caseId });
  if (actor.roleKey === "STUDENT") throw new ConflictError("Only staff can enter an EUR value");
  if (src.currency === "EUR") throw new ValidationError("This source is already in EUR");
  const eur = parseMoney(data.eurAmount, "EUR");
  const rate = Number(data.exchangeRate.replace(",", "."));
  return mutateCase(actor, src.caseId, { staff: "funding.write" }, "funding.eur_value", async (tx) => {
    await tx.fundingSource.update({
      where: { id: src.id },
      data: { eurValueMinor: eur.amountMinor, exchangeRate: rate, exchangeRateDate: fromISODate(data.rateDate), convertedById: actor.id },
    });
    await audit(actor, tx, "funding.eur_value", "FundingSource", src.id, src.caseId, { eurMinor: eur.amountMinor, rate, rateDate: data.rateDate });
  });
}

// ───────────── Steps 8–9: sponsors ─────────────

export async function saveSponsor(actor: AuthUser, input: unknown, caseId?: string) {
  const data = sponsorSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  const [source, relationship] = await Promise.all([
    db.fundingSource.findUnique({ where: { id: data.fundingSourceId } }),
    db.sponsorRelationship.findUnique({ where: { code: data.relationshipCode } }),
  ]);
  if (!source || source.caseId !== cid || source.type !== "SPONSOR") throw new NotFoundError("Funding source not found");
  if (!relationship) throw new ValidationError("Unknown relationship");
  return mutateCase(actor, cid, FUNDING, "sponsor.save", async (tx) => {
    if (source.sponsorId) {
      await tx.sponsor.update({ where: { id: source.sponsorId }, data: { fullName: data.fullName, relationshipId: relationship.id } });
      await audit(actor, tx, "sponsor.update", "Sponsor", source.sponsorId, cid, { relationship: relationship.code });
      return source.sponsorId;
    }
    const sponsor = await tx.sponsor.create({ data: { studentId, caseId: cid, fullName: data.fullName, relationshipId: relationship.id } });
    await tx.fundingSource.update({ where: { id: source.id }, data: { sponsorId: sponsor.id } });
    await audit(actor, tx, "sponsor.create", "Sponsor", sponsor.id, cid, { relationship: relationship.code });
    return sponsor.id;
  });
}

export async function saveSponsorStatus(actor: AuthUser, input: unknown, caseId?: string) {
  const data = sponsorStatusSchema.parse(input);
  const cid = await targetCase(actor, caseId);
  const sponsor = await db.sponsor.findUnique({ where: { id: data.sponsorId } });
  if (!sponsor || sponsor.caseId !== cid) throw new NotFoundError("Sponsor not found");
  return mutateCase(actor, cid, FUNDING, "sponsor.status", async (tx) => {
    await tx.sponsor.update({
      where: { id: sponsor.id },
      data: {
        professionalStatus: data.professionalStatus,
        // Pension fund is asked, never assumed: only kept for retired sponsors
        pensionFund: data.professionalStatus === "RETIRED" ? data.pensionFund : null,
        occupation: data.occupation ?? null,
        fundedByDescription: data.professionalStatus === "UNEMPLOYED_NO_INCOME" ? data.fundedByDescription : null,
        sourceOfFunds: data.professionalStatus === "UNEMPLOYED_NO_INCOME" ? data.sourceOfFunds : null,
      },
    });
    await audit(actor, tx, "sponsor.update", "Sponsor", sponsor.id, cid, { professionalStatus: data.professionalStatus, pensionFund: data.pensionFund ?? null });
  });
}

// ───────────── Step 10: generate the checklist ─────────────

export async function completeOnboarding(actor: AuthUser, caseId?: string) {
  const cid = await targetCase(actor, caseId);
  const studentId = await studentOfCase(cid);
  return mutateCase(actor, cid, STAFF_STUDENTS, "onboarding.complete", async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { onboardingCompleted: true, onboardingStep: 10 } });
    const c = await tx.case.findUniqueOrThrow({ where: { id: cid }, include: { currentStage: true } });
    // Only ever move forward from the early stages
    if (c.currentStage.sortOrder < 11) await changeCaseStage(tx, cid, "FINANCIAL_DOCUMENTATION", { userId: actor.id, note: "Onboarding completed" });
    await audit(actor, tx, "onboarding.complete", "Student", studentId, cid);
  });
}

export async function setOnboardingStep(actor: AuthUser, step: number) {
  if (actor.roleKey !== "STUDENT" || !actor.studentId) return;
  await db.student.updateMany({ where: { id: actor.studentId, onboardingStep: { lt: step } }, data: { onboardingStep: Math.min(step, 10) } });
}

// ───────────── University applications (student + staff) ─────────────

export async function saveApplication(actor: AuthUser, input: unknown, opts: { caseId?: string; applicationId?: string } = {}) {
  const data = applicationSchema.parse(input);
  const cid = await targetCase(actor, opts.caseId);
  const program = await db.universityProgram.findUnique({ where: { id: data.programId } });
  if (!program) throw new NotFoundError("Program not found");
  // Students report progress on their own applications; the outcome (accepted / rejected / enrolled) is set by staff.
  const studentStatuses = ["PLANNED", "PREPARING", "SUBMITTED", "WITHDRAWN"];
  if (actor.roleKey === "STUDENT" && !studentStatuses.includes(data.status)) throw new ValidationError("Only the agency can set this status");
  return mutateCase(actor, cid, APPLICATIONS, "application.save", async (tx) => {
    const values = {
      programId: program.id,
      universityId: program.universityId,
      academicYearId: program.academicYearId,
      status: data.status,
      deadline: data.deadline ? fromISODate(data.deadline) : program.applicationDeadline,
      admissionResult: actor.roleKey === "STUDENT" ? undefined : data.admissionResult,
      conditions: actor.roleKey === "STUDENT" ? undefined : data.conditions,
      notes: data.notes,
      applicationFeeMinor: program.applicationFeeMinor,
      applicationFeeCurrency: program.applicationFeeCurrency,
    };
    if (opts.applicationId) {
      const existing = await tx.universityApplication.findFirst({ where: { id: opts.applicationId, caseId: cid } });
      if (!existing) throw new NotFoundError("Application not found");
      await tx.universityApplication.update({ where: { id: existing.id }, data: values });
      await audit(actor, tx, "application.update", "UniversityApplication", existing.id, cid, { status: data.status });
      return existing.id;
    }
    const created = await tx.universityApplication.create({ data: { caseId: cid, ...values } });
    await audit(actor, tx, "application.create", "UniversityApplication", created.id, cid, { programId: program.id });
    return created.id;
  });
}

// ───────────── Universitaly & visa (attached to the application, not the student) ─────────────

async function applicationCase(applicationId: string) {
  const app = await db.universityApplication.findUnique({ where: { id: applicationId }, select: { id: true, caseId: true, programId: true } });
  if (!app) throw new NotFoundError("Application not found");
  return app;
}

/** The student can enter the Universitaly contact e-mail (ALMAVIVA writes to it); everything else is staff. */
export async function saveUniversitaly(actor: AuthUser, applicationId: string, input: unknown) {
  const data = universitalySchema.parse(input);
  const app = await applicationCase(applicationId);
  const studentOnlyEmail = actor.roleKey === "STUDENT";
  return mutateCase(actor, app.caseId, { staff: "visa.write", self: "self.profile" }, "universitaly.save", async (tx) => {
    const values = studentOnlyEmail
      ? { contactEmail: data.contactEmail ?? null, referenceId: data.referenceId ?? null }
      : {
          contactEmail: data.contactEmail ?? null,
          referenceId: data.referenceId ?? null,
          submissionDate: data.submissionDate ? fromISODate(data.submissionDate) : null,
          status: data.status,
          validationStatus: data.validationStatus ?? null,
          correctionsRequested: data.correctionsRequested ?? null,
          transmittedToEmbassy: data.transmittedToEmbassy ?? false,
          transmittedAt: data.transmittedAt ? fromISODate(data.transmittedAt) : null,
          notes: data.notes ?? null,
        };
    const uc = await tx.universitalyCase.upsert({ where: { applicationId }, create: { applicationId, ...values }, update: values });
    await audit(actor, tx, "universitaly.update", "UniversitalyCase", uc.id, app.caseId, { status: data.status });
    return uc.id;
  });
}

/** Staff manage the visa case. Changing the appointment date recomputes the passport check via re-evaluation. */
export async function saveVisa(actor: AuthUser, applicationId: string, input: unknown) {
  const data = visaSchema.parse(input);
  const app = await applicationCase(applicationId);
  return mutateCase(actor, app.caseId, { staff: "visa.write" }, "visa.save", async (tx) => {
    const existing = await tx.visaCase.findUnique({ where: { applicationId } });
    const programId = data.programId ?? existing?.programId ?? app.programId;
    const values = {
      stage: data.stage,
      visaType: data.visaType,
      programId,
      intendedEnrollmentProgramId: data.intendedEnrollmentProgramId ?? existing?.intendedEnrollmentProgramId ?? programId,
      appointmentAt: data.appointmentAt ? new Date(data.appointmentAt) : existing?.appointmentAt ?? null,
      submissionDate: data.submissionDate ? fromISODate(data.submissionDate) : existing?.submissionDate ?? null,
      reference: data.reference ?? existing?.reference ?? null,
      decision: data.decision ?? existing?.decision ?? null,
      additionalRequests: data.additionalRequests ?? existing?.additionalRequests ?? null,
      arrivalDate: data.arrivalDate ? fromISODate(data.arrivalDate) : existing?.arrivalDate ?? null,
      notes: data.notes ?? existing?.notes ?? null,
    };
    const visa = await tx.visaCase.upsert({ where: { applicationId }, create: { applicationId, ...values, stage: data.stage ?? "DOCUMENT_PREPARATION" }, update: values });
    await audit(actor, tx, "visa.update", "VisaCase", visa.id, app.caseId, { stage: visa.stage, appointmentAt: visa.appointmentAt?.toISOString() ?? null });
    if (existing && data.stage && data.stage !== existing.stage) {
      const { writeTimeline } = await import("@/server/audit");
      const { notify, studentUserId } = await import("@/server/notifications");
      await writeTimeline({ caseId: app.caseId, type: "visa.stage_changed", title: "Visa stage changed", detail: data.stage, actorId: actor.id }, tx);
      await notify({ userId: await studentUserId(app.caseId, tx), caseId: app.caseId, type: "visa.status", title: "Visa status changed", data: { stage: data.stage }, link: "/student/visa" }, tx);
    }
    return visa.id;
  });
}

/** Money helper for UI code paths that need the parsed amount without persisting. */
export function previewMoney(amount: string, currency: string) {
  return money(parseMoney(amount, currency).amountMinor, currency);
}
