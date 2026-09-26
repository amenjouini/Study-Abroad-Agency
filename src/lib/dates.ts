/**
 * Date helpers working on ISO calendar dates ("YYYY-MM-DD") in UTC.
 * Business dates (deadlines, expiry dates) have no time zone, so we avoid local-time Date arithmetic.
 */

export type ISODate = string;

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(fromISODate(s).getTime());
}

export function addCalendarDays(date: ISODate, days: number): ISODate {
  const d = fromISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Add months, clamping to the end of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = fromISODate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISODate(d);
}

export function isWeekend(date: ISODate): boolean {
  const dow = fromISODate(date).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isWorkingDay(date: ISODate, holidays: ReadonlySet<ISODate>): boolean {
  return !isWeekend(date) && !holidays.has(date);
}

/** The n-th working day after `date` (weekends and holidays skipped). n = 0 returns `date`. */
export function addWorkingDays(date: ISODate, n: number, holidays: ReadonlySet<ISODate>): ISODate {
  if (n < 0) throw new RangeError("Working days offset must be >= 0");
  let current = date;
  let remaining = n;
  while (remaining > 0) {
    current = addCalendarDays(current, 1);
    if (isWorkingDay(current, holidays)) remaining -= 1;
  }
  return current;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 86_400_000);
}

export function minDate(dates: Array<ISODate | null | undefined>): ISODate | null {
  const present = dates.filter((d): d is ISODate => !!d).map((d) => d.slice(0, 10));
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a <= b ? a : b));
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}
