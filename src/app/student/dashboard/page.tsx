import type { Metadata } from "next";
import { CalendarDays, CreditCard, FileText, GraduationCap, Landmark, LifeBuoy, MessageSquare, Award, ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Card, CardBody, Progress } from "@/components/ui/primitives";
import { formatDate, formatDateTime, localizeSubjectLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getStudentDashboard } from "@/server/dashboards";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

function Tile({ href, icon: Icon, label, children }: { href: string; icon: typeof FileText; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group block rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
        </span>
        <ArrowRight className="rtl-flip h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>
      <div className="mt-2 text-sm">{children}</div>
    </Link>
  );
}

export default async function StudentDashboard() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.dashboard");
  const tc = await getTranslations("common");
  const te = await getTranslations("enums");
  const d = await getStudentDashboard(user, locale);
  if (!d.onboardingCompleted) redirect("/student/onboarding");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tc("welcome", { name: d.firstName })} 👋</h1>
      </div>

      {d.underReview ? (
        <Alert tone="info" title={t("underReviewTitle")}>
          {t("underReviewBody")}
        </Alert>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{t("journey")}</p>
              <p className="text-lg font-semibold tabular-nums">{d.stage.progress}%</p>
            </div>
            <Progress value={d.stage.progress} className="mt-2" label={t("journey")} />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("currentStage")}</dt>
              <dd className="mt-0.5 font-medium">{d.stage.name}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("nextAction")}</dt>
              <dd className="mt-0.5 font-medium">
                {d.nextAction ? (
                  <Link href="/student/documents" className="text-primary hover:underline">
                    {t("uploadX", { name: d.nextAction.name })}
                    {d.nextAction.subject ? ` (${localizeSubjectLabel(d.nextAction.subject, (c) => (te.has(`Relationship.${c}` as never) ? te(`Relationship.${c}` as never) : undefined))})` : ""}
                  </Link>
                ) : (
                  t("allCaughtUp")
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("deadline")}</dt>
              <dd className="mt-0.5 font-medium">{d.deadline ? formatDate(d.deadline, locale) : "—"}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tile href="/student/documents" icon={FileText} label={t("documents")}>
          <p className="text-base font-semibold tabular-nums">{t("approvedOf", { approved: d.documents.approved, total: d.documents.total })}</p>
        </Tile>
        <Tile href="/student/payments" icon={CreditCard} label={t("payments")}>
          {d.payments.totals.length === 0 ? (
            <p className="text-muted-foreground">{t("noPayments")}</p>
          ) : (
            <>
              {d.payments.totals.map((tot) => (
                <p key={tot.currency} className="text-base font-semibold tabular-nums">
                  {t("remainingAmount", { amount: formatMoney(tot.remaining, locale) })}
                </p>
              ))}
              {d.payments.next ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("nextPayment", { name: d.payments.next.name, date: formatDate(d.payments.next.dueDate, locale) })}
                </p>
              ) : null}
              {d.payments.hasLate ? <p className="mt-1 text-xs font-medium text-danger">{t("paymentLate")}</p> : null}
            </>
          )}
        </Tile>
        <Tile href="/student/applications" icon={GraduationCap} label={t("university")}>
          {d.university ? (
            <>
              <p className="font-medium">{d.university.name}</p>
              <p className="text-xs text-muted-foreground">{d.university.program}</p>
              <div className="mt-1.5">
                <EnumBadge enumName="ApplicationStatus" value={d.university.status} />
              </div>
              {d.applicationsCount > 1 ? <p className="mt-1 text-xs text-muted-foreground">{t("moreApplications", { n: d.applicationsCount - 1 })}</p> : null}
            </>
          ) : (
            <p className="text-muted-foreground">{t("noApplication")}</p>
          )}
        </Tile>
        <Tile href="/student/scholarships" icon={Award} label={t("scholarship")}>
          {d.scholarship ? (
            <>
              <p className="font-medium">{d.scholarship.name}</p>
              <div className="mt-1.5">
                <EnumBadge enumName="ScholarshipApplicationStatus" value={d.scholarship.status} />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">{t("noScholarship")}</p>
          )}
        </Tile>
        <Tile href="/student/visa" icon={Landmark} label={t("visa")}>
          {d.visa ? (
            <>
              <EnumBadge enumName="VisaStage" value={d.visa.stage} />
              {d.visa.appointmentAt ? <p className="mt-1 text-xs text-muted-foreground">{t("visaAppointment", { date: formatDateTime(d.visa.appointmentAt, locale) })}</p> : null}
            </>
          ) : (
            <p className="text-muted-foreground">{t("noVisa")}</p>
          )}
        </Tile>
        <Tile href="/student/appointments" icon={CalendarDays} label={t("appointment")}>
          {d.appointment ? (
            <>
              <p className="font-medium">{formatDateTime(d.appointment.startsAt, locale)}</p>
              <div className="mt-1.5">
                <EnumBadge enumName="AppointmentStatus" value={d.appointment.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("agencyAppointmentNote")}</p>
            </>
          ) : (
            <p className="text-muted-foreground">{t("noAppointment")}</p>
          )}
        </Tile>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/student/help" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-primary transition-colors hover:border-primary">
          <LifeBuoy className="h-6 w-6 shrink-0" aria-hidden />
          <span>
            <span className="block text-sm font-semibold">{t("helpTitle")}</span>
            <span className="block text-xs text-primary/80">{t("helpBody")}</span>
          </span>
        </Link>
        <Link href="/student/messages" className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
          <MessageSquare className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="block text-sm font-semibold">{t("messages")}</span>
            <span className="block text-xs text-muted-foreground">{d.unreadMessages > 0 ? t("unread", { n: d.unreadMessages }) : t("noUnread")}</span>
          </span>
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">{tc("visaDisclaimer")}</p>
    </div>
  );
}
