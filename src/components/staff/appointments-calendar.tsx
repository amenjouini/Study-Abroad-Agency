import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppointmentButtons } from "@/app/staff/students/[id]/forms";
import { EnumBadge } from "@/components/status-badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { addCalendarDays, fromISODate, toISODate, todayISO } from "@/lib/dates";
import { intlLocale } from "@/lib/format";
import { zonedToUtc } from "@/lib/appointments";
import { caseAccessWhere, type AuthUser } from "@/server/authz";
import { AGENCY_TZ } from "@/server/appointments";

type View = "day" | "week" | "month";

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: AGENCY_TZ }).format(d);
const timeLabel = (d: Date, locale: string) => new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone: AGENCY_TZ }).format(d);

function startOfWeek(date: string): string {
  const dow = fromISODate(date).getUTCDay();
  return addCalendarDays(date, -((dow + 6) % 7)); // Monday
}

function range(view: View, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: addCalendarDays(date, 1) };
  if (view === "week") {
    const from = startOfWeek(date);
    return { from, to: addCalendarDays(from, 7) };
  }
  const first = `${date.slice(0, 7)}-01`;
  const gridFrom = startOfWeek(first);
  return { from: gridFrom, to: addCalendarDays(gridFrom, 42) };
}

export async function AppointmentsCalendar({ user, area, searchParams }: { user: AuthUser; area: "staff" | "admin"; searchParams: { view?: string; date?: string } }) {
  const locale = await getLocale();
  const t = await getTranslations("staff.appointments");
  const te = await getTranslations("enums");
  const view: View = searchParams.view === "day" || searchParams.view === "month" ? searchParams.view : "week";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : todayISO();
  const { from, to } = range(view, date);
  const rows = await db.agencyAppointment.findMany({
    where: { startsAt: { gte: zonedToUtc(from, "00:00", AGENCY_TZ), lt: zonedToUtc(to, "00:00", AGENCY_TZ) }, case: await caseAccessWhere(user, "appointments.read") },
    orderBy: { startsAt: "asc" },
    include: { case: { include: { student: { select: { firstName: true, lastName: true } } } } },
  });
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(dayKey(r.startsAt), [...(byDay.get(dayKey(r.startsAt)) ?? []), r]);

  const step = view === "day" ? 1 : view === "week" ? 7 : 30;
  const prev = view === "month" ? toISODate(new Date(Date.UTC(fromISODate(date).getUTCFullYear(), fromISODate(date).getUTCMonth() - 1, 1))) : addCalendarDays(date, -step);
  const next = view === "month" ? toISODate(new Date(Date.UTC(fromISODate(date).getUTCFullYear(), fromISODate(date).getUTCMonth() + 1, 1))) : addCalendarDays(date, step);
  const href = (v: View, d: string) => `/${area}/appointments?view=${v}&date=${d}`;
  const title = new Intl.DateTimeFormat(intlLocale(locale), view === "month" ? { month: "long", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(fromISODate(date));
  const dayLabel = (d: string) => new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", timeZone: "UTC" }).format(fromISODate(d));

  const item = (a: (typeof rows)[number], withActions: boolean) => (
    <div key={a.id} className="rounded-md border border-border bg-card p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{timeLabel(a.startsAt, locale)}</span>
        <EnumBadge enumName="AppointmentStatus" value={a.status} />
      </div>
      <Link href={`/staff/students/${a.caseId}?tab=review`} className="mt-1 block font-medium text-primary hover:underline">
        {a.case.student.firstName} {a.case.student.lastName}
      </Link>
      <p className="text-muted-foreground">
        {te(`AppointmentType.${a.type}`)} — {a.reason}
      </p>
      {a.urgency !== "NORMAL" ? <p className="mt-0.5 font-medium text-danger">{te(`Priority.${a.urgency}`)}</p> : null}
      {withActions ? <div className="mt-2"><AppointmentButtons id={a.id} status={a.status} /></div> : null}
    </div>
  );

  const days: string[] = [];
  for (let d = from; d < to; d = addCalendarDays(d, 1)) days.push(d);

  return (
    <>
      <PageHeader title={t("title")} description={t("agencyOnly")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={href(view, prev)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">←</Link>
          <Link href={href(view, todayISO())} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">{t("today")}</Link>
          <Link href={href(view, next)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">→</Link>
          <span className="ms-2 text-sm font-medium">{title}</span>
        </div>
        <div className="flex gap-1">
          {(["day", "week", "month"] as const).map((v) => (
            <Link key={v} href={href(v, date)} className={`rounded-md border px-3 py-1.5 text-sm ${v === view ? "border-primary bg-accent text-primary" : "border-border bg-card"}`}>
              {t(`views.${v}`)}
            </Link>
          ))}
        </div>
      </div>

      {view === "day" ? (
        rows.length === 0 ? <EmptyState title={t("none")} /> : <div className="space-y-2">{rows.map((a) => item(a, true))}</div>
      ) : view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => (
            <div key={d} className={`min-h-24 rounded-lg border p-2 ${d === todayISO() ? "border-primary/50 bg-accent/40" : "border-border bg-muted/30"}`}>
              <Link href={href("day", d)} className="mb-2 block text-xs font-semibold text-muted-foreground hover:text-primary">{dayLabel(d)}</Link>
              <div className="space-y-2">{(byDay.get(d) ?? []).map((a) => item(a, false))}</div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="py-2">{new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).format(fromISODate(d))}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              return (
                <Link key={d} href={href("day", d)} className={`min-h-20 border-b border-e border-border p-1.5 text-xs hover:bg-muted/40 ${inMonth ? "" : "bg-muted/30 text-muted-foreground"}`}>
                  <span className={d === todayISO() ? "font-bold text-primary" : ""}>{Number(d.slice(8))}</span>
                  {list.slice(0, 3).map((a) => (
                    <span key={a.id} className="mt-0.5 block truncate rounded bg-accent px-1 text-primary">{timeLabel(a.startsAt, locale)} {a.case.student.lastName}</span>
                  ))}
                  {list.length > 3 ? <span className="text-muted-foreground">+{list.length - 3}</span> : null}
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
