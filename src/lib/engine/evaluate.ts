import { CurrencyMismatchError } from "../money";
import { minDate, type ISODate } from "../dates";
import { CALCULATION, DEADLINE } from "./constants";
import { computeDeadline, effectiveDeadline } from "./deadlines";
import { calculateFunding } from "./funding";
import { calculatePassport } from "./passport";
import { evaluateRule, getPath, RuleReferenceError } from "./rules";
import type {
  ApplicationFacts,
  CaseFacts,
  ComputedDeadline,
  EngineResult,
  HumanReviewFlag,
  ProcedureDefinition,
  RequiredInstance,
  RequirementDef,
  RequirementStatus,
  ScholarshipFacts,
  SubjectType,
} from "./types";

const DEAD_APPLICATION = new Set(["REJECTED", "WITHDRAWN"]);
const DEAD_SCHOLARSHIP = new Set(["REJECTED", "WITHDRAWN"]);

/** The application the case-level calculations (funding, passport) are based on. */
export function pickPrimaryApplication(apps: ApplicationFacts[]): ApplicationFacts | null {
  const live = apps.filter((a) => !DEAD_APPLICATION.has(a.status));
  const advanced = (a: ApplicationFacts) => a.status === "ACCEPTED" || a.status === "ENROLLED";
  return (
    live.find((a) => advanced(a) && a.visa) ??
    live.find(advanced) ??
    live.find((a) => a.visa) ??
    live[0] ??
    null
  );
}

function pickPrimaryScholarship(list: ScholarshipFacts[]): ScholarshipFacts | null {
  const live = list.filter((s) => !DEAD_SCHOLARSHIP.has(s.status));
  if (live.length === 0) return null;
  return [...live].sort((a, b) => (b.amountEur?.amountMinor ?? 0) - (a.amountEur?.amountMinor ?? 0))[0];
}

interface Subject {
  id: string;
  label: string;
  ctx: Record<string, unknown>;
}

function applicationContext(app: ApplicationFacts): Record<string, unknown> {
  const visa = app.visa
    ? { ...app.visa, programMismatch: app.visa.programId !== app.visa.intendedEnrollmentProgramId }
    : undefined;
  return {
    application: { id: app.id, status: app.status, hasVisa: !!app.visa, universitalyValidated: !!app.universitalyValidated },
    program: app.program,
    university: app.university,
    visa,
  };
}

/**
 * Pure, deterministic requirement engine.
 * Input: case facts + procedure version. Output: required instances, calculated values, review flags.
 * It never reads the database; a service loads the facts and persists the result.
 */
export function evaluateCase(facts: CaseFacts, proc: ProcedureDefinition): EngineResult {
  const params = proc.parameters;
  const primary = pickPrimaryApplication(facts.applications);
  const holidaysFor = (code?: string | null): ReadonlySet<ISODate> => new Set(code ? (proc.holidays[code] ?? []) : []);

  // ── Deadlines ──
  const basisCtx = { visa: primary?.visa ?? undefined, case: { plannedSubmissionDate: facts.plannedSubmissionDate } };
  const deadlines: Record<string, ComputedDeadline> = {};
  for (const def of proc.deadlines) {
    const basis = def.offsetBasis ? (getPath(basisCtx, def.offsetBasis) as ISODate | undefined) : undefined;
    deadlines[def.code] = computeDeadline(def, basis ?? null, holidaysFor(def.holidayCountryCode));
  }

  const effectiveAppointmentDeadlines: Record<string, ISODate | null> = {};
  for (const app of facts.applications) {
    effectiveAppointmentDeadlines[app.id] = effectiveDeadline(
      deadlines[DEADLINE.VISA_APPOINTMENT]?.date,
      app.university.visaAppointmentDeadline,
      app.program.visaAppointmentDeadline,
    );
  }

  // ── Calculations ──
  const funding = calculateFunding(facts, params, primary?.program ?? null);
  const passport = calculatePassport(
    {
      passportExpiry: facts.student.passportExpiry,
      appointmentDate: primary?.visa?.appointmentDate,
      plannedSubmissionDate: facts.plannedSubmissionDate,
      fallbackReferenceDate: primary ? effectiveAppointmentDeadlines[primary.id] : minDate(Object.values(effectiveAppointmentDeadlines)),
    },
    params,
  );
  const visaMismatches = facts.applications
    .filter((a) => a.visa && a.visa.programId !== a.visa.intendedEnrollmentProgramId)
    .map((a) => a.id);

  const scholarship = pickPrimaryScholarship(facts.scholarships);
  const baseCtx: Record<string, unknown> = {
    case: { id: facts.caseId, today: facts.today, plannedSubmissionDate: facts.plannedSubmissionDate ?? undefined },
    student: facts.student,
    scholarship: scholarship ?? undefined,
    academicYear: proc.academicYear,
    primary: primary ? applicationContext(primary) : undefined,
    calc: { funding: funding ?? undefined, passport: passport ?? undefined },
  };
  const env = (extra: Record<string, unknown>) => ({ context: { ...baseCtx, ...extra }, params });

  const subjectsFor = (type: SubjectType): Subject[] => {
    switch (type) {
      case "CASE":
        return [{ id: facts.caseId, label: "Case", ctx: {} }];
      case "STUDENT":
        return [{ id: facts.student.id, label: "Student", ctx: {} }];
      case "SPONSOR":
        return facts.sponsors.map((s) => ({ id: s.id, label: s.label, ctx: { sponsor: s } }));
      case "FUNDING_SOURCE":
        return facts.fundingSources.map((f) => ({
          id: f.id,
          label: f.label,
          ctx: { funding: { id: f.id, type: f.type, sponsorId: f.sponsorId, amount: f.amount } },
        }));
      case "APPLICATION":
        return facts.applications.map((a) => ({ id: a.id, label: a.label, ctx: applicationContext(a) }));
    }
  };

  // ── Requirement instances ──
  const instances: RequiredInstance[] = [];
  const flags: HumanReviewFlag[] = [];
  const requirements = [...proc.requirements].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  for (const req of requirements) {
    for (const subject of subjectsFor(req.subjectType)) {
      let applies: boolean;
      try {
        applies = evaluateRule(req.rule, env(subject.ctx));
      } catch (e) {
        if (e instanceof CurrencyMismatchError || e instanceof RuleReferenceError) {
          flags.push({
            dedupeKey: `RULE_ERROR:${req.code}:${subject.id}`,
            code: "RULE_ERROR",
            priority: "HIGH",
            reason: `Rule for ${req.code} could not be evaluated: ${e.message}`,
            subjectType: req.subjectType,
            subjectId: subject.id,
          });
          continue;
        }
        throw e;
      }
      if (!applies) continue;

      const deadline = instanceDeadline(req, subject.id, deadlines, effectiveAppointmentDeadlines);
      const base: RequiredInstance = {
        key: `${req.code}|${req.subjectType}|${subject.id}`,
        requirementId: req.id,
        requirementCode: req.code,
        kind: req.kind,
        subjectType: req.subjectType,
        subjectId: subject.id,
        subjectLabel: subject.label,
        deadline,
      };

      if (req.kind === "HUMAN_REVIEW") {
        const reason = req.reviewReason ?? `${req.name} requires human review`;
        instances.push({ ...base, status: "REQUIRES_HUMAN_REVIEW", humanReviewReason: reason });
        flags.push({
          dedupeKey: `${req.code}:${subject.id}`,
          code: req.code,
          priority: req.reviewPriority ?? "NORMAL",
          reason: `${reason} (${subject.label})`,
          subjectType: req.subjectType,
          subjectId: subject.id,
        });
      } else if (req.kind === "CALCULATED") {
        const calc = calculatedInstance(req, passport, funding);
        if (!calc) {
          flags.push({
            dedupeKey: `UNSUPPORTED_CALCULATION:${req.code}`,
            code: "UNSUPPORTED_CALCULATION",
            priority: "HIGH",
            reason: `Unsupported calculation "${req.calculationKey}" on ${req.code}`,
            subjectType: req.subjectType,
            subjectId: subject.id,
          });
          continue;
        }
        instances.push({ ...base, ...calc });
      } else {
        instances.push(base);
      }
    }
  }

  // ── Engine-level flags ──
  if (funding?.needsStaffConfirmation) {
    flags.push({
      dedupeKey: "REDUCED_REQUIREMENT_CONFIRMATION",
      code: "REDUCED_REQUIREMENT_CONFIRMATION",
      priority: "NORMAL",
      reason: "Program shorter than the reference period: staff must confirm the proportionally reduced financial requirement.",
      subjectType: "CASE",
      subjectId: facts.caseId,
    });
  }
  for (const issue of funding?.issues ?? []) {
    const [code, id] = issue.split(":");
    flags.push({
      dedupeKey: issue,
      code,
      priority: "NORMAL",
      reason: "A funding source in a foreign currency has no staff-entered EUR value.",
      subjectType: "FUNDING_SOURCE",
      subjectId: id,
    });
  }

  return {
    instances,
    humanReviewFlags: flags,
    requiresHumanReview: flags.length > 0,
    funding,
    passport,
    deadlines,
    effectiveAppointmentDeadlines,
    visaMismatches,
  };
}

function instanceDeadline(
  req: RequirementDef,
  subjectId: string,
  deadlines: Record<string, ComputedDeadline>,
  effectiveAppointment: Record<string, ISODate | null>,
): ISODate | null {
  if (!req.deadlineCode) return null;
  if (req.deadlineCode === DEADLINE.VISA_APPOINTMENT && req.subjectType === "APPLICATION") {
    return effectiveAppointment[subjectId] ?? null;
  }
  return deadlines[req.deadlineCode]?.date ?? null;
}

function calculatedInstance(
  req: RequirementDef,
  passport: EngineResult["passport"],
  funding: EngineResult["funding"],
): Pick<RequiredInstance, "status" | "calculation" | "referenceDate"> | null {
  if (req.calculationKey === CALCULATION.PASSPORT_VALIDITY) {
    if (!passport) return null;
    let status: RequirementStatus = "NOT_STARTED";
    if (passport.satisfied === true) status = "APPROVED";
    else if (passport.satisfied === false) status = "NEEDS_CORRECTION";
    return { status, calculation: { ...passport }, referenceDate: passport.referenceDate };
  }
  if (req.calculationKey === CALCULATION.FUNDING_SUFFICIENCY) {
    if (!funding) return null;
    const status: RequirementStatus = funding.shortfall.amountMinor === 0 ? "APPROVED" : "NEEDS_CORRECTION";
    return { status, calculation: { required: funding.required, available: funding.available, shortfall: funding.shortfall, surplus: funding.surplus } };
  }
  return null;
}
