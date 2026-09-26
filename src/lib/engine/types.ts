import type { ISODate } from "../dates";
import type { Money } from "../money";

// ───────── Procedure definition (loaded from the database, immutable input of the engine) ─────────

export type SubjectType = "CASE" | "STUDENT" | "SPONSOR" | "FUNDING_SOURCE" | "APPLICATION";
export type RequirementKind = "DOCUMENT" | "CALCULATED" | "HUMAN_REVIEW";
export type RuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "after"
  | "exists"
  | "not_exists";
export type RuleGroupOperator = "AND" | "OR" | "NOT";

export type RequirementStatus =
  | "NOT_STARTED"
  | "REQUESTED"
  | "UPLOADED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_CORRECTION"
  | "EXPIRED"
  | "NOT_APPLICABLE"
  | "REQUIRES_HUMAN_REVIEW";

export interface RuleCondition {
  type: "condition";
  field: string;
  operator: RuleOperator;
  /** Literal, array, or reference: {"$param": key} / {"$field": path} */
  value?: unknown;
}

export interface RuleGroup {
  type: "group";
  operator: RuleGroupOperator;
  children: RuleNode[];
}

export type RuleNode = RuleCondition | RuleGroup;

export interface RequirementDef {
  id: string;
  code: string;
  kind: RequirementKind;
  subjectType: SubjectType;
  name: string;
  mandatory: boolean;
  calculationKey?: string | null;
  reviewReason?: string | null;
  reviewPriority?: "NORMAL" | "HIGH" | "URGENT";
  deadlineCode?: string | null;
  sortOrder: number;
  /** null = always applicable */
  rule: RuleNode | null;
}

export interface DependencyDef {
  requirementCode: string;
  prerequisiteCode: string;
}

export interface DeadlineDef {
  code: string;
  name: string;
  scope: "GENERAL" | "UNIVERSITY" | "PROGRAM";
  kind: "FIXED_DATE" | "OFFSET";
  fixedDate?: ISODate | null;
  offsetBasis?: string | null;
  offsetDays?: number | null;
  dayType: "CALENDAR_DAYS" | "WORKING_DAYS";
  holidayCountryCode?: string | null;
  reminderDays: number[];
  priority: "NORMAL" | "HIGH" | "URGENT";
  sourceName?: string | null;
  sourceUrl?: string | null;
}

export interface ProcedureDefinition {
  versionId: string;
  academicYear: string;
  /** Typed parameters: amounts, months, thresholds, allowed relationships… */
  parameters: Record<string, unknown>;
  requirements: RequirementDef[];
  dependencies: DependencyDef[];
  deadlines: DeadlineDef[];
  /** Holidays per country code, ISO dates */
  holidays: Record<string, ISODate[]>;
}

// ───────── Case facts (loaded by a service, never read by the engine itself) ─────────

export interface StudentFacts {
  id: string;
  nationality: string;
  passportExpiry?: ISODate | null;
  desiredDegreeLevel?: string | null;
  studyLanguage?: string | null;
  languageCertificateLevel?: string | null;
  declarationStatus?: string | null;
  cimeaStatus?: string | null;
  hasBac?: boolean;
  degreeLevels: string[];
}

export interface SponsorFacts {
  id: string;
  label: string;
  relationship: string;
  professionalStatus?: string | null;
  pensionFund?: string | null;
}

export interface FundingSourceFacts {
  id: string;
  type: "SPONSOR" | "SCHOLARSHIP" | "INSTITUTIONAL" | "SELF_FUNDED" | "OTHER";
  sponsorId?: string | null;
  label: string;
  amount: Money;
  /** Staff-entered EUR value for non-EUR sources, with exchange rate, rate date and staff member. */
  eurValue?: {
    amountMinor: number;
    exchangeRate: number | string;
    rateDate: ISODate;
    convertedById: string;
  } | null;
}

export interface ProgramFacts {
  id: string;
  name: string;
  degreeLevel: string;
  language: string;
  durationMonths: number;
  visaAppointmentDeadline?: ISODate | null;
}

export interface UniversityFacts {
  id: string;
  name: string;
  cityId?: string;
  visaAppointmentDeadline?: ISODate | null;
}

export interface VisaFacts {
  stage: string;
  appointmentDate?: ISODate | null;
  arrivalDate?: ISODate | null;
  programId: string;
  intendedEnrollmentProgramId: string;
}

export interface ApplicationFacts {
  id: string;
  label: string;
  status: string;
  university: UniversityFacts;
  program: ProgramFacts;
  visa?: VisaFacts | null;
  universitalyValidated?: boolean;
}

export interface ScholarshipFacts {
  id: string;
  name: string;
  kind: string;
  status: string;
  /** Awarded/expected amount expressed in EUR (staff-entered when not in EUR) */
  amountEur?: Money | null;
}

export interface CaseFacts {
  caseId: string;
  today: ISODate;
  student: StudentFacts;
  sponsors: SponsorFacts[];
  fundingSources: FundingSourceFacts[];
  applications: ApplicationFacts[];
  scholarships: ScholarshipFacts[];
  plannedSubmissionDate?: ISODate | null;
  /** Staff-confirmed required amount overriding the proportional proposal for short programs */
  confirmedRequiredAmount?: Money | null;
}

// ───────── Engine output ─────────

export interface FundingCalculation {
  required: Money;
  available: Money;
  shortfall: Money;
  surplus: Money;
  /** Set when the program is shorter than the reference period: proposed proportional amount */
  proposedRequired: Money | null;
  needsStaffConfirmation: boolean;
  contributions: Array<{
    fundingSourceId: string;
    label: string;
    counted: boolean;
    amountEur: Money | null;
    reason?: string;
  }>;
  issues: string[];
}

export interface PassportCalculation {
  applicable: boolean;
  satisfied: boolean | null;
  passportExpiry: ISODate | null;
  referenceDate: ISODate | null;
  referenceSource: "VISA_APPOINTMENT" | "PLANNED_SUBMISSION" | "EFFECTIVE_APPOINTMENT_DEADLINE" | null;
  requiredValidUntilAfter: ISODate | null;
  monthsRequired: number;
}

export interface ComputedDeadline {
  code: string;
  date: ISODate | null;
  method: "FIXED_DATE" | "CALENDAR_DAYS" | "WORKING_DAYS";
  basis?: string | null;
  basisDate?: ISODate | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  reminderDates: ISODate[];
}

export interface RequiredInstance {
  key: string;
  requirementId: string;
  requirementCode: string;
  kind: RequirementKind;
  subjectType: SubjectType;
  subjectId: string;
  subjectLabel: string;
  deadline: ISODate | null;
  /** Status imposed by the engine (calculated / human review); undefined for plain documents. */
  status?: RequirementStatus;
  calculation?: Record<string, unknown>;
  referenceDate?: ISODate | null;
  humanReviewReason?: string;
}

export interface HumanReviewFlag {
  dedupeKey: string;
  code: string;
  reason: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  subjectType: SubjectType;
  subjectId: string;
}

export interface EngineResult {
  instances: RequiredInstance[];
  humanReviewFlags: HumanReviewFlag[];
  requiresHumanReview: boolean;
  funding: FundingCalculation | null;
  passport: PassportCalculation | null;
  deadlines: Record<string, ComputedDeadline>;
  /** Effective visa appointment deadline per application (MIN of general, university, program) */
  effectiveAppointmentDeadlines: Record<string, ISODate | null>;
  /** Serious course/visa mismatches per application id */
  visaMismatches: string[];
}

export interface ExistingInstance {
  id: string;
  key: string;
  status: RequirementStatus;
  previousStatus?: RequirementStatus | null;
  hasDocuments: boolean;
  deadline?: ISODate | null;
  humanReviewReason?: string | null;
  calculation?: unknown;
}
