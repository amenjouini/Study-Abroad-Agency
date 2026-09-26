/**
 * Keys under which procedure values are stored in the database (procedure_parameters,
 * procedure_deadlines, procedure_requirements). These are identifiers only — the VALUES
 * (amounts, months, dates, lists) always come from the procedure version.
 */
export const PARAM = {
  PUBLISHED_MINIMUM_TOTAL: "financial.published_minimum_total",
  MONTHLY_REFERENCE_AMOUNT: "financial.monthly_reference_amount",
  REFERENCE_MONTHS: "financial.months",
  REFERENCE_DURATION_MONTHS: "funding.reference_duration_months",
  ALLOWED_RELATIONSHIPS: "funding.allowed_relationships",
  PASSPORT_MIN_VALIDITY_MONTHS: "passport.min_validity_months",
} as const;

export const DEADLINE = {
  VISA_APPOINTMENT: "VISA_APPOINTMENT",
  UNIVERSITALY_ENROLLMENT: "UNIVERSITALY_ENROLLMENT",
  PERMESSO_LEGAL: "PERMESSO_LEGAL",
  PERMESSO_CONSERVATIVE: "PERMESSO_CONSERVATIVE",
} as const;

export const CALCULATION = {
  PASSPORT_VALIDITY: "PASSPORT_VALIDITY",
  FUNDING_SUFFICIENCY: "FUNDING_SUFFICIENCY",
} as const;

export const FORMALITIES = [
  "originalPresented",
  "signed",
  "stamped",
  "translated",
  "legalized",
  "apostilled",
] as const;
export type Formality = (typeof FORMALITIES)[number];
