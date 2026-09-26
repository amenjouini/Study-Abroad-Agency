import { describe, expect, it } from "vitest";
import { italy2026Definition } from "../prisma/seed/procedure-data";
import { evaluateCase } from "../src/lib/engine/evaluate";
import { calculateFunding } from "../src/lib/engine/funding";
import {
  addMoney,
  CurrencyMismatchError,
  formatMoney,
  money,
  MoneyParseError,
  parseMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
} from "../src/lib/money";
import { makeFacts, makeSponsor } from "./helpers/facts";

const proc = italy2026Definition();

describe("money", () => {
  it("rejects adding amounts in different currencies", () => {
    expect(() => addMoney(money(100, "EUR"), money(100, "TND"))).toThrow(CurrencyMismatchError);
    expect(() => subtractMoney(money(100, "EUR"), money(100, "TND"))).toThrow(CurrencyMismatchError);
    expect(() => sumMoney([money(1, "EUR"), money(1, "TND")], "EUR")).toThrow(CurrencyMismatchError);
  });

  it("TND formats with 3 decimals, EUR with 2", () => {
    expect(formatMoney(money(300000, "TND"), "en")).toBe("300.000 TND");
    expect(formatMoney(money(1234567, "TND"), "en")).toBe("1,234.567 TND");
    expect(formatMoney(money(1679_85, "EUR"), "en")).toBe("1,679.85 EUR");
  });

  it("TND parses with 3 decimals, EUR with 2", () => {
    expect(parseMoney("300.500", "TND")).toEqual({ amountMinor: 300500, currency: "TND" });
    expect(parseMoney("300,5", "TND")).toEqual({ amountMinor: 300500, currency: "TND" });
    expect(parseMoney("1 679,85", "EUR")).toEqual({ amountMinor: 167985, currency: "EUR" });
    expect(parseMoney("1,234.567", "TND")).toEqual({ amountMinor: 1234567, currency: "TND" });
    expect(parseMoney("10179.85", "EUR").amountMinor).toBe(1017985);
  });

  it("refuses more decimals than the currency allows and non-numeric input", () => {
    expect(() => parseMoney("1.234", "EUR")).toThrow(MoneyParseError);
    expect(() => parseMoney("1.2345", "TND")).toThrow(MoneyParseError);
    expect(() => parseMoney("abc", "EUR")).toThrow(MoneyParseError);
    expect(() => parseMoney("", "EUR")).toThrow(MoneyParseError);
  });

  it("round-trips through a decimal string", () => {
    expect(toDecimalString(money(1017985, "EUR"))).toBe("10179.85");
    expect(toDecimalString(money(5, "TND"))).toBe("0.005");
    expect(parseMoney(toDecimalString(money(987654, "TND")), "TND").amountMinor).toBe(987654);
  });

  it("integer minor units only", () => {
    expect(() => money(1.5, "EUR")).toThrow(MoneyParseError);
  });
});

describe("funding calculation", () => {
  const uncleTnd = (eurValue: boolean) => ({
    id: "fs-uncle",
    type: "SPONSOR" as const,
    sponsorId: "sp-uncle",
    label: "Uncle",
    amount: { amountMinor: 8_000_000, currency: "TND" },
    eurValue: eurValue
      ? { amountMinor: 250000, exchangeRate: "0.3125", rateDate: "2026-09-20", convertedById: "staff-1" }
      : null,
  });
  const scenario = (eurValue = true) =>
    makeFacts({
      sponsors: [makeSponsor({ id: "sp-uncle", label: "Uncle", relationship: "UNCLE_AUNT" })],
      scholarships: [{ id: "s1", name: "DSU Toscana", kind: "REGIONAL", status: "AWARDED", amountEur: money(600000, "EUR") }],
      fundingSources: [
        { id: "fs-sch", type: "SCHOLARSHIP", label: "DSU Toscana", amount: money(600000, "EUR") },
        uncleTnd(eurValue),
      ],
    });

  it("10,179.85 − 6,000 − 2,500 = shortfall 1,679.85", () => {
    const f = evaluateCase(scenario(), proc).funding!;
    expect(f.required).toEqual(money(1017985, "EUR"));
    expect(f.available).toEqual(money(850000, "EUR"));
    expect(f.shortfall).toEqual(money(167985, "EUR"));
    expect(f.surplus).toEqual(money(0, "EUR"));
  });

  it("the published minimum is read from the procedure version (10,179.85, not 783.06 × 13 = 10,179.78)", () => {
    const f = evaluateCase(makeFacts({ fundingSources: [] }), proc).funding!;
    expect(f.required.amountMinor).toBe(1017985);
    expect(f.required.amountMinor).not.toBe(78306 * 13);
    // A different version with another published value changes the result without any code change
    const other = { ...proc, parameters: { ...proc.parameters, "financial.published_minimum_total": money(1200000, "EUR") } };
    expect(evaluateCase(makeFacts(), other).funding!.required.amountMinor).toBe(1200000);
  });

  it("a TND source without a staff-entered EUR value does not count and is flagged", () => {
    const r = evaluateCase(scenario(false), proc);
    expect(r.funding!.available).toEqual(money(600000, "EUR"));
    expect(r.humanReviewFlags.map((x) => x.code)).toContain("MISSING_EUR_VALUE");
  });

  it("ineligible relatives are not counted", () => {
    const facts = makeFacts({
      sponsors: [makeSponsor({ id: "sp-f", relationship: "FRIEND" })],
      fundingSources: [{ id: "fs", type: "SPONSOR", sponsorId: "sp-f", label: "Friend", amount: money(1017985, "EUR") }],
    });
    const f = evaluateCase(facts, proc).funding!;
    expect(f.available.amountMinor).toBe(0);
    expect(f.contributions[0].reason).toBe("SPONSOR_RELATIONSHIP_NOT_ELIGIBLE");
  });

  it("surplus when funding exceeds the requirement", () => {
    const facts = makeFacts({
      fundingSources: [{ id: "fs", type: "INSTITUTIONAL", label: "University", amount: money(1100000, "EUR") }],
    });
    const f = evaluateCase(facts, proc).funding!;
    expect(f.shortfall.amountMinor).toBe(0);
    expect(f.surplus.amountMinor).toBe(1100000 - 1017985);
  });

  it("programs shorter than 12 months: proportional proposal, flagged for staff confirmation", () => {
    const base = makeFacts();
    const app = { ...base.applications[0], program: { ...base.applications[0].program, durationMonths: 6 } };
    const r = evaluateCase({ ...base, applications: [app] }, proc);
    expect(r.funding!.proposedRequired!.amountMinor).toBe(Math.round(1017985 / 2));
    expect(r.funding!.required.amountMinor).toBe(1017985); // published stays until staff confirm
    expect(r.humanReviewFlags.map((x) => x.code)).toContain("REDUCED_REQUIREMENT_CONFIRMATION");

    const confirmed = evaluateCase({ ...base, applications: [app], confirmedRequiredAmount: money(509000, "EUR") }, proc);
    expect(confirmed.funding!.required.amountMinor).toBe(509000);
    expect(confirmed.humanReviewFlags.map((x) => x.code)).not.toContain("REDUCED_REQUIREMENT_CONFIRMATION");
  });

  it("returns null when the procedure version has no financial requirement", () => {
    expect(calculateFunding(makeFacts(), {}, null)).toBeNull();
  });
});
