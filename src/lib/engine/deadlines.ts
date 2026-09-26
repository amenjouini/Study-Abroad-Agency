import { addCalendarDays, addWorkingDays, minDate, type ISODate } from "../dates";
import type { ComputedDeadline, DeadlineDef } from "./types";

export function computeReminderDates(deadline: ISODate | null, reminderDays: number[]): ISODate[] {
  if (!deadline) return [];
  return [...reminderDays].sort((a, b) => b - a).map((n) => addCalendarDays(deadline, -n));
}

/**
 * Fixed date, or offset from a basis date in calendar or working days
 * (working days skip weekends and the given holidays).
 */
export function computeDeadline(
  def: DeadlineDef,
  basisDate: ISODate | null | undefined,
  holidays: ReadonlySet<ISODate>,
): ComputedDeadline {
  let date: ISODate | null = null;
  if (def.kind === "FIXED_DATE") {
    date = def.fixedDate ? def.fixedDate.slice(0, 10) : null;
  } else if (basisDate && typeof def.offsetDays === "number") {
    const basis = basisDate.slice(0, 10);
    date =
      def.dayType === "WORKING_DAYS"
        ? addWorkingDays(basis, def.offsetDays, holidays)
        : addCalendarDays(basis, def.offsetDays);
  }
  return {
    code: def.code,
    date,
    method: def.kind === "FIXED_DATE" ? "FIXED_DATE" : def.dayType,
    basis: def.offsetBasis ?? null,
    basisDate: basisDate ? basisDate.slice(0, 10) : null,
    sourceName: def.sourceName ?? null,
    sourceUrl: def.sourceUrl ?? null,
    reminderDates: computeReminderDates(date, def.reminderDays),
  };
}

/** effective_deadline = MIN(general, university, program), ignoring missing values. */
export function effectiveDeadline(
  general?: ISODate | null,
  university?: ISODate | null,
  program?: ISODate | null,
): ISODate | null {
  return minDate([general, university, program]);
}
