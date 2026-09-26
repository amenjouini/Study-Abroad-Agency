/**
 * Money is always integer minor units + ISO 4217 currency code.
 * TND has 3 decimals (millimes), EUR has 2. Amounts in different currencies are never combined.
 */

export const CURRENCY_DECIMALS: Record<string, number> = {
  TND: 3,
  EUR: 2,
  USD: 2,
  GBP: 2,
  CAD: 2,
  TRY: 2,
  JPY: 0,
};

export interface Money {
  amountMinor: number;
  currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine amounts in different currencies (${a} and ${b})`);
    this.name = "CurrencyMismatchError";
  }
}

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

export function decimalsFor(currency: string): number {
  const d = CURRENCY_DECIMALS[currency.toUpperCase()];
  if (d === undefined) throw new MoneyParseError(`Unsupported currency: ${currency}`);
  return d;
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new MoneyParseError("Amount in minor units must be an integer");
  }
  decimalsFor(currency);
  return { amountMinor, currency: currency.toUpperCase() };
}

export function isMoney(v: unknown): v is Money {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Money).amountMinor === "number" &&
    typeof (v as Money).currency === "string"
  );
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function sumMoney(list: Money[], currency: string): Money {
  return list.reduce<Money>((acc, m) => addMoney(acc, m), money(0, currency));
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return Math.sign(a.amountMinor - b.amountMinor);
}

export function maxMoney(a: Money, zero: number = 0): Money {
  return { amountMinor: Math.max(a.amountMinor, zero), currency: a.currency };
}

/** Format using the currency's own number of decimals, e.g. 1679.85 EUR or 300.000 TND. */
export function formatMoney(m: Money, locale = "fr"): string {
  const decimals = decimalsFor(m.currency);
  const value = m.amountMinor / 10 ** decimals;
  const intl = locale === "ar" ? "ar-TN-u-nu-latn" : locale;
  const number = new Intl.NumberFormat(intl, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${number} ${m.currency}`;
}

/**
 * Parse a user-entered decimal amount into minor units.
 * A lone separator (`,` or `.`) is always the decimal separator; when both appear the last one is.
 * More decimals than the currency allows is an error (never silently rounded).
 */
export function parseMoney(input: string, currency: string): Money {
  const decimals = decimalsFor(currency);
  let s = input.replace(/[\s  ']/g, "");
  if (!s) throw new MoneyParseError("Amount is empty");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decimalIdx = Math.max(lastComma, lastDot);
  let intPart = s;
  let fracPart = "";
  if (decimalIdx >= 0) {
    intPart = s.slice(0, decimalIdx).replace(/[.,]/g, "");
    fracPart = s.slice(decimalIdx + 1);
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (intPart === "" && fracPart === "")) {
    throw new MoneyParseError(`Invalid amount: ${input}`);
  }
  if (fracPart.length > decimals) {
    throw new MoneyParseError(`${currency} allows at most ${decimals} decimals`);
  }
  const minor = Number(intPart || "0") * 10 ** decimals + Number(fracPart.padEnd(decimals, "0") || "0");
  if (!Number.isSafeInteger(minor)) throw new MoneyParseError("Amount too large");
  return money(negative ? -minor : minor, currency);
}

/** Plain decimal string for form inputs, e.g. "1679.85". */
export function toDecimalString(m: Money): string {
  const decimals = decimalsFor(m.currency);
  const abs = Math.abs(m.amountMinor);
  const int = Math.floor(abs / 10 ** decimals);
  const frac = String(abs % 10 ** decimals).padStart(decimals, "0");
  const sign = m.amountMinor < 0 ? "-" : "";
  return decimals ? `${sign}${int}.${frac}` : `${sign}${int}`;
}
