import { fromISODate, type ISODate } from "@/lib/dates";

export interface AppointmentSettings {
  /** 0 = Sunday … 6 = Saturday */
  workingDays: number[];
  startTime: string; // HH:mm in the agency time zone
  endTime: string;
  slotMinutes: number;
  maxPerDay: number;
  blockedDates: ISODate[];
  minNoticeHours: number;
}

export interface AvailabilityOverride {
  date: ISODate;
  startTime: string;
  endTime: string;
  kind: "OPEN" | "BLOCKED";
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  /** "HH:mm" in the agency time zone */
  label: string;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const minutesToHHmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Convert a wall-clock date + time in an IANA time zone to a UTC instant (no DST assumptions). */
export function zonedToUtc(date: ISODate, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asIfUtc - guess));
}

/**
 * Bookable slots for one day: weekly schedule from the admin settings, minus blocked dates and blocked windows,
 * minus slots already taken, minus the past / short-notice window, capped by the maximum per day.
 */
export function generateSlots(
  date: ISODate,
  settings: AppointmentSettings,
  overrides: AvailabilityOverride[],
  takenStarts: Date[],
  now: Date,
  timeZone: string,
): Slot[] {
  if (settings.blockedDates.includes(date)) return [];
  const dow = fromISODate(date).getUTCDay();
  const windows: Array<[number, number]> = [];
  if (settings.workingDays.includes(dow)) windows.push([toMinutes(settings.startTime), toMinutes(settings.endTime)]);
  const dayOverrides = overrides.filter((o) => o.date === date);
  for (const o of dayOverrides.filter((x) => x.kind === "OPEN")) windows.push([toMinutes(o.startTime), toMinutes(o.endTime)]);
  const blocked = dayOverrides.filter((x) => x.kind === "BLOCKED").map((o) => [toMinutes(o.startTime), toMinutes(o.endTime)] as const);

  const takenTimes = new Set(takenStarts.map((d) => d.getTime()));
  if (takenStarts.length >= settings.maxPerDay) return [];
  const earliest = now.getTime() + settings.minNoticeHours * 3_600_000;

  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const [from, to] of windows) {
    for (let m = from; m + settings.slotMinutes <= to; m += settings.slotMinutes) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (blocked.some(([bs, be]) => m < be && m + settings.slotMinutes > bs)) continue;
      const startsAt = zonedToUtc(date, minutesToHHmm(m), timeZone);
      if (startsAt.getTime() < earliest || takenTimes.has(startsAt.getTime())) continue;
      slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + settings.slotMinutes * 60_000), label: minutesToHHmm(m) });
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, Math.max(0, settings.maxPerDay - takenStarts.length) || undefined);
}
