import { addMoney, money, subtractMoney, type Money } from "../money";
import { PARAM } from "./constants";
import type { CaseFacts, FundingCalculation, ProgramFacts } from "./types";

function asMoney(v: unknown, what: string): Money {
  const m = v as Money | undefined;
  if (!m || typeof m.amountMinor !== "number" || typeof m.currency !== "string") {
    throw new Error(`Procedure parameter ${what} must be a money value`);
  }
  return m;
}

/** Pure funding calculation: Required, Available, Shortfall, Surplus — all read from the procedure version. */
export function calculateFunding(
  facts: CaseFacts,
  params: Record<string, unknown>,
  program: ProgramFacts | null,
): FundingCalculation | null {
  if (!(PARAM.PUBLISHED_MINIMUM_TOTAL in params)) return null;
  const published = asMoney(params[PARAM.PUBLISHED_MINIMUM_TOTAL], PARAM.PUBLISHED_MINIMUM_TOTAL);
  const currency = published.currency;
  const allowed = (params[PARAM.ALLOWED_RELATIONSHIPS] as string[] | undefined) ?? [];
  const referenceMonths = params[PARAM.REFERENCE_DURATION_MONTHS] as number | undefined;

  const issues: string[] = [];
  let proposedRequired: Money | null = null;
  let needsStaffConfirmation = false;
  if (program && referenceMonths && program.durationMonths < referenceMonths) {
    proposedRequired = money(
      Math.round((published.amountMinor * program.durationMonths) / referenceMonths),
      currency,
    );
    needsStaffConfirmation = !facts.confirmedRequiredAmount;
  }
  const required =
    facts.confirmedRequiredAmount && facts.confirmedRequiredAmount.currency === currency
      ? facts.confirmedRequiredAmount
      : published;

  const sponsorById = new Map(facts.sponsors.map((s) => [s.id, s]));
  const contributions: FundingCalculation["contributions"] = [];
  let available = money(0, currency);

  for (const src of facts.fundingSources) {
    let eligible = true;
    let reason: string | undefined;
    if (src.type === "SELF_FUNDED") {
      eligible = false;
      reason = "SELF_FUNDED_NOT_LISTED";
    } else if (src.type === "SPONSOR") {
      const sponsor = src.sponsorId ? sponsorById.get(src.sponsorId) : undefined;
      if (!sponsor || !allowed.includes(sponsor.relationship)) {
        eligible = false;
        reason = "SPONSOR_RELATIONSHIP_NOT_ELIGIBLE";
      }
    }

    // A source in another currency counts only through the staff-entered EUR value.
    let amountEur: Money | null = null;
    if (src.amount.currency === currency) {
      amountEur = src.amount;
    } else if (src.eurValue) {
      amountEur = money(src.eurValue.amountMinor, currency);
    } else if (eligible) {
      eligible = false;
      reason = "MISSING_EUR_VALUE";
      issues.push(`MISSING_EUR_VALUE:${src.id}`);
    }

    if (eligible && amountEur) available = addMoney(available, amountEur);
    contributions.push({
      fundingSourceId: src.id,
      label: src.label,
      counted: eligible && !!amountEur,
      amountEur,
      reason,
    });
  }

  const gap = subtractMoney(required, available);
  return {
    required,
    available,
    shortfall: money(Math.max(gap.amountMinor, 0), currency),
    surplus: money(Math.max(-gap.amountMinor, 0), currency),
    proposedRequired,
    needsStaffConfirmation,
    contributions,
    issues,
  };
}
