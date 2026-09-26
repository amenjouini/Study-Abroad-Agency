import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");
const optionalDate = z.union([isoDate, z.literal("")]).optional().transform((v) => (v ? v : undefined));
const optionalText = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const id = z.string().min(1).max(64);

export const DEGREE_LEVELS = ["BACHELOR", "MASTER", "SINGLE_CYCLE", "PHD", "SPECIALIZATION"] as const;
export const TEACHING_LANGUAGES = ["IT", "EN"] as const;
export const SPONSOR_STATUSES = ["EMPLOYEE", "RETIRED", "BUSINESS_OWNER", "PROFESSIONAL", "UNEMPLOYED_NO_INCOME", "OTHER"] as const;
export const PENSION_FUNDS = ["CNSS", "CNRPS", "OTHER"] as const;
export const FUNDING_TYPES = ["SPONSOR", "SCHOLARSHIP", "INSTITUTIONAL", "SELF_FUNDED", "OTHER"] as const;
export const CURRENCIES = ["EUR", "TND"] as const;
export const DECLARATION_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "OBTAINED"] as const;

/** Step 1 — personal information */
export const personalSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, "invalid_phone"),
  dateOfBirth: isoDate,
  gender: z.enum(["F", "M", ""]).optional().transform((v) => v || undefined),
  passportNumber: z.string().trim().min(5).max(20).regex(/^[A-Za-z0-9]+$/, "invalid_passport"),
  passportExpiry: isoDate,
  address: optionalText(300),
});
export type PersonalInput = z.input<typeof personalSchema>;

/** Step 2 — study language */
export const languageSchema = z.object({
  studyLanguage: z.enum(TEACHING_LANGUAGES),
  languageLevel: optionalText(20),
  languageCertificate: optionalText(60),
  languageCertificateLevel: optionalText(20),
  languageCertificateExpiry: optionalDate,
});
export type LanguageInput = z.input<typeof languageSchema>;

/** Step 3 — academic profile (multiple university degrees allowed) */
export const academicSchema = z.object({
  bacYear: z.coerce.number().int().min(1990).max(2035),
  bacSection: z.string().trim().min(1).max(60),
  bacGrade: z.coerce.number().min(0).max(20),
  degrees: z
    .array(
      z.object({
        level: z.enum(DEGREE_LEVELS),
        title: z.string().trim().min(1).max(120),
        institution: optionalText(120),
        year: z.coerce.number().int().min(1990).max(2035).optional(),
        grade: optionalText(20),
      }),
    )
    .max(6),
  declarationStatus: z.enum(DECLARATION_STATUSES),
  cimeaStatus: z.enum(DECLARATION_STATUSES),
  desiredDegreeLevel: z.enum(DEGREE_LEVELS),
});
export type AcademicInput = z.input<typeof academicSchema>;

/** Step 4 — desired city */
export const citySchema = z.object({ cityId: id });

/** Step 5 — university and program */
export const programChoiceSchema = z.object({ programId: id });

/** Step 6 — scholarship */
export const scholarshipChoiceSchema = z.object({
  wantsScholarship: z.boolean(),
  scholarshipVersionId: id.optional(),
});

/** Step 7 — funding sources (amount typed as a decimal string, parsed with the currency's own decimals) */
export const fundingSourceSchema = z.object({
  type: z.enum(FUNDING_TYPES),
  description: optionalText(200),
  amount: z.string().trim().min(1).max(20),
  currency: z.enum(CURRENCIES),
  sourceOfFunds: optionalText(200),
});
export type FundingSourceInput = z.input<typeof fundingSourceSchema>;

/** Step 8 — sponsor for a SPONSOR-type funding source */
export const sponsorSchema = z.object({
  fundingSourceId: id,
  fullName: z.string().trim().min(2).max(120),
  relationshipCode: z.string().trim().min(1).max(40),
});

/** Step 9 — sponsor professional status (conditional fields) */
export const sponsorStatusSchema = z
  .object({
    sponsorId: id,
    professionalStatus: z.enum(SPONSOR_STATUSES),
    pensionFund: z.enum(PENSION_FUNDS).optional(),
    occupation: optionalText(120),
    fundedByDescription: optionalText(300),
    sourceOfFunds: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.professionalStatus === "RETIRED" && !v.pensionFund) ctx.addIssue({ code: "custom", path: ["pensionFund"], message: "required" });
    if (v.professionalStatus === "UNEMPLOYED_NO_INCOME") {
      if (!v.fundedByDescription) ctx.addIssue({ code: "custom", path: ["fundedByDescription"], message: "required" });
      if (!v.sourceOfFunds) ctx.addIssue({ code: "custom", path: ["sourceOfFunds"], message: "required" });
    }
  });
export type SponsorStatusInput = z.input<typeof sponsorStatusSchema>;

/** Staff: EUR value for a non-EUR funding source */
export const eurValueSchema = z.object({
  fundingSourceId: id,
  eurAmount: z.string().trim().min(1).max(20),
  exchangeRate: z.string().trim().regex(/^\d+([.,]\d{1,6})?$/, "invalid_rate"),
  rateDate: isoDate,
});

/** University applications */
export const applicationSchema = z.object({
  programId: id,
  status: z.enum(["PLANNED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION", "ADDITIONAL_DOCUMENTS", "ACCEPTED", "REJECTED", "WITHDRAWN", "ENROLLED"]).default("PLANNED"),
  deadline: optionalDate,
  admissionResult: optionalText(200),
  conditions: optionalText(500),
  notes: optionalText(500),
});
export type ApplicationInput = z.input<typeof applicationSchema>;

export const universitalySchema = z.object({
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()).optional().or(z.literal("").transform(() => undefined)),
  referenceId: optionalText(60),
  submissionDate: optionalDate,
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "CORRECTIONS_REQUESTED", "VALIDATED", "TRANSMITTED_TO_EMBASSY"]).optional(),
  validationStatus: optionalText(120),
  correctionsRequested: optionalText(500),
  transmittedToEmbassy: z.boolean().optional(),
  transmittedAt: optionalDate,
  notes: optionalText(500),
});

export const VISA_STAGES = [
  "DOCUMENT_PREPARATION", "DOCUMENT_REVIEW", "FILE_COMPLETE", "UNIVERSITALY_VALIDATED", "APPOINTMENT_PENDING", "APPOINTMENT_SCHEDULED",
  "SUBMITTED", "PROCESSING", "ADDITIONAL_DOCUMENTS", "APPROVED", "REFUSED", "PASSPORT_RETURNED",
] as const;

export const visaSchema = z.object({
  stage: z.enum(VISA_STAGES).optional(),
  visaType: optionalText(60),
  intendedEnrollmentProgramId: id.optional(),
  programId: id.optional(),
  appointmentAt: z.string().trim().optional().transform((v) => (v ? v : undefined)),
  submissionDate: optionalDate,
  reference: optionalText(60),
  decision: optionalText(120),
  additionalRequests: optionalText(500),
  arrivalDate: optionalDate,
  notes: optionalText(500),
});
