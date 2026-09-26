import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FilterBar } from "@/components/staff/filter-bar";
import { EnumBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney, money } from "@/lib/money";
import { getStaffDashboard, filterOptions, parseFilters } from "@/server/staff-queries";
import { markLatePayments } from "@/server/payments";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {count !== undefined ? <span className="text-xs text-muted-foreground">{count}</span> : null}
      </CardHeader>
      {children}
    </Card>
  );
}

const name = (c: { student: { firstName: string; lastName: string } }) => `${c.student.firstName} ${c.student.lastName}`;

export default async function StaffDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireArea("staff");
  const locale = await getLocale();
  const t = await getTranslations("staff.dashboard");
  const tc = await getTranslations("common");
  const filters = parseFilters(await searchParams);
  await markLatePayments();
  const [d, options] = await Promise.all([getStaffDashboard(user, filters), filterOptions(user)]);
  const row = "flex items-center justify-between gap-3 px-4 py-2.5 text-sm";

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <FilterBar action="/staff/dashboard" filters={filters} options={options} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("activeCases")} value={d.activeCases} />
        <Stat label={t("needsReview")} value={d.review.length} />
        <Stat label={t("docsAwaiting")} value={d.awaiting.length} />
        <Stat label={t("latePayments")} value={d.latePayments.length} />
      </div>

      <div className="space-y-5">
        <Section title={t("humanReview")} count={d.review.length}>
          {d.review.length === 0 ? (
            <div className="p-4"><EmptyState title={t("noneReview")} /></div>
          ) : (
            <ul className="divide-y divide-border">
              {d.review.map((r) => (
                <li key={r.id} className={row}>
                  <div className="min-w-0">
                    <Link href={`/staff/students/${r.caseId}?tab=review`} className="font-medium text-primary hover:underline">{name(r.case)}</Link>
                    <p className="truncate text-xs text-muted-foreground">{r.source === "STUDENT_HELP" ? `${t("helpRequest")}: ` : ""}{r.reason}</p>
                  </div>
                  <EnumBadge enumName="Priority" value={r.priority} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title={t("awaitingReview")} count={d.awaiting.length}>
            {d.awaiting.length === 0 ? <div className="p-4"><EmptyState title={t("noneDocs")} /></div> : (
              <ul className="divide-y divide-border">
                {d.awaiting.map((i) => (
                  <li key={i.id} className={row}>
                    <div className="min-w-0">
                      <Link href={`/staff/documents?instance=${i.id}`} className="font-medium text-primary hover:underline">{i.requirement.name}</Link>
                      <p className="text-xs text-muted-foreground">{name(i.case)}</p>
                    </div>
                    <EnumBadge enumName="RequirementStatus" value={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("rejectedDocs")} count={d.rejected.length}>
            {d.rejected.length === 0 ? <div className="p-4"><EmptyState title={t("noneRejected")} /></div> : (
              <ul className="divide-y divide-border">
                {d.rejected.map((i) => (
                  <li key={i.id} className={row}>
                    <div className="min-w-0">
                      <Link href={`/staff/students/${i.caseId}?tab=documents`} className="font-medium text-primary hover:underline">{i.requirement.name}</Link>
                      <p className="truncate text-xs text-muted-foreground">{name(i.case)} — {i.rejectionReason}</p>
                    </div>
                    <EnumBadge enumName="RequirementStatus" value={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("upcomingAppointments")} count={d.appointments.length}>
            {d.appointments.length === 0 ? <div className="p-4"><EmptyState title={t("noneAppointments")} /></div> : (
              <ul className="divide-y divide-border">
                {d.appointments.map((a) => (
                  <li key={a.id} className={row}>
                    <div>
                      <Link href="/staff/appointments" className="font-medium text-primary hover:underline">{formatDateTime(a.startsAt, locale)}</Link>
                      <p className="text-xs text-muted-foreground">{name(a.case)} — {a.reason}</p>
                    </div>
                    <EnumBadge enumName="AppointmentStatus" value={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("urgentTasks")} count={d.urgentTasks.length}>
            {d.urgentTasks.length === 0 ? <div className="p-4"><EmptyState title={t("noneTasks")} /></div> : (
              <ul className="divide-y divide-border">
                {d.urgentTasks.map((k) => (
                  <li key={k.id} className={row}>
                    <div>
                      <Link href="/staff/tasks" className="font-medium text-primary hover:underline">{k.title}</Link>
                      <p className="text-xs text-muted-foreground">{k.case ? name(k.case) : ""}{k.dueDate ? ` — ${formatDate(k.dueDate, locale)}` : ""}</p>
                    </div>
                    <EnumBadge enumName="Priority" value={k.priority} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("paymentIssues")} count={d.latePayments.length}>
            {d.latePayments.length === 0 ? <div className="p-4"><EmptyState title={t("nonePayments")} /></div> : (
              <ul className="divide-y divide-border">
                {d.latePayments.map((p) => (
                  <li key={p.id} className={row}>
                    <div>
                      <Link href={`/staff/students/${p.caseId}?tab=payments`} className="font-medium text-primary hover:underline">{name(p.case)}</Link>
                      <p className="text-xs text-muted-foreground">{p.name} — {formatMoney(money(p.amountMinor, p.currency), locale)}{p.dueDate ? ` — ${formatDate(p.dueDate, locale)}` : ""}</p>
                    </div>
                    <EnumBadge enumName="PaymentStatus" value={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t("upcomingDeadlines")} count={d.deadlines.length}>
            {d.deadlines.length === 0 ? <div className="p-4"><EmptyState title={t("noneDeadlines")} /></div> : (
              <ul className="divide-y divide-border">
                {d.deadlines.map((i) => (
                  <li key={i.id} className={row}>
                    <div>
                      <Link href={`/staff/students/${i.caseId}?tab=documents`} className="font-medium text-primary hover:underline">{i.requirement.name}</Link>
                      <p className="text-xs text-muted-foreground">{name(i.case)}</p>
                    </div>
                    <span className="text-xs tabular-nums">{formatDate(i.deadline, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{tc("basedOnEmbassy")}</p>
    </>
  );
}
