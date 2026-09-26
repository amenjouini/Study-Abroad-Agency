import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { VISA_STAGES } from "@/lib/validation/domain";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Visa" };

interface Snapshot {
  deadlines?: Record<string, { date: string | null; method: string; sourceName?: string | null; sourceUrl?: string | null }>;
  effectiveAppointmentDeadlines?: Record<string, string | null>;
  passport?: { satisfied: boolean | null; requiredValidUntilAfter: string | null; passportExpiry: string | null } | null;
}

export default async function StudentVisa() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.visa");
  const tc = await getTranslations("common");
  const caseId = await ownCaseId(user);
  const c = await db.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      procedureVersion: { include: { parameters: true } },
      applications: { include: { university: true, program: true, visa: true, universitaly: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const snap = (c.engineSnapshot ?? {}) as Snapshot;
  const param = (key: string) => c.procedureVersion.parameters.find((p) => p.key === key)?.value;
  const processingDays = param("appointment.processing_days_max") as number | undefined;
  const withVisa = c.applications.filter((a) => a.visa);
  const stageIdx = (s: string) => VISA_STAGES.indexOf(s as (typeof VISA_STAGES)[number]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Alert tone="warning">{tc("visaDisclaimer")}</Alert>

      {withVisa.length === 0 ? <EmptyState title={t("none")} description={t("noneBody")} /> : null}

      {withVisa.map((a) => {
        const v = a.visa!;
        const effective = snap.effectiveAppointmentDeadlines?.[a.id];
        return (
          <Card key={a.id}>
            <CardHeader>
              <div>
                <CardTitle>{a.university.name}</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">{a.program.name}</p>
              </div>
              <EnumBadge enumName="VisaStage" value={v.stage} />
            </CardHeader>
            <CardBody className="space-y-4">
              <ol className="flex flex-wrap gap-1.5" aria-label={t("progress")}>
                {VISA_STAGES.map((s) => (
                  <li key={s} className={`h-1.5 min-w-6 flex-1 rounded-full ${stageIdx(s) <= stageIdx(v.stage) ? "bg-primary" : "bg-muted"}`} title={s} />
                ))}
              </ol>

              {v.stage === "APPOINTMENT_PENDING" ? (
                <Alert tone="warning" title={t("pendingTitle")}>
                  {t("pendingBody")}
                  {a.universitaly?.contactEmail ? <span className="mt-1 block font-medium">{a.universitaly.contactEmail}</span> : <span className="mt-1 block text-danger">{t("noContactEmail")}</span>}
                </Alert>
              ) : null}

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("appointment")}</dt>
                  <dd>{v.appointmentAt ? `${formatDateTime(v.appointmentAt, locale)} (${v.appointmentSource})` : t("appointmentUnknown")}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("submission")}</dt>
                  <dd>{v.submissionDate ? formatDate(v.submissionDate, locale) : "—"}</dd>
                </div>
                {effective ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("appointmentDeadline")}</dt>
                    <dd>{formatDate(effective, locale)}</dd>
                  </div>
                ) : null}
                {v.reference ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("reference")}</dt>
                    <dd>{v.reference}</dd>
                  </div>
                ) : null}
                {v.decision ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("decision")}</dt>
                    <dd>{v.decision}</dd>
                  </div>
                ) : null}
              </dl>

              {v.additionalRequests ? (
                <Alert tone="danger" title={t("additionalRequests")}>
                  {v.additionalRequests}
                </Alert>
              ) : null}
              {v.programId !== v.intendedEnrollmentProgramId ? (
                <Alert tone="danger" title={t("mismatchTitle")}>
                  {t("mismatchBody")}
                </Alert>
              ) : null}

              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>{t("almavivaNote")}</li>
                <li>{t("datesFixed")}</li>
                {processingDays ? <li>{t("processing", { days: processingDays })}</li> : null}
                <li>{t("agencyNoAppointments")}</li>
              </ul>
            </CardBody>
          </Card>
        );
      })}

      {snap.deadlines ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("keyDates")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {snap.deadlines.VISA_APPOINTMENT?.date ? (
              <p>
                <span className="font-medium">{t("generalAppointmentDeadline")}:</span> {formatDate(snap.deadlines.VISA_APPOINTMENT.date, locale)}
              </p>
            ) : null}
            {snap.deadlines.UNIVERSITALY_ENROLLMENT?.date ? (
              <div>
                <p>
                  <span className="font-medium">{t("universitalyEnrollment")}:</span> {formatDate(snap.deadlines.UNIVERSITALY_ENROLLMENT.date, locale)}
                </p>
                <p className="text-xs text-muted-foreground">{t("universitalyEnrollmentNote")}</p>
              </div>
            ) : null}
            {snap.deadlines.PERMESSO_CONSERVATIVE?.date ? (
              <Alert tone="warning" title={t("permessoTitle")}>
                <p className="text-base font-semibold">{formatDate(snap.deadlines.PERMESSO_CONSERVATIVE.date, locale)}</p>
                <p className="mt-1">{t("permessoBody")}</p>
                <p className="mt-1 font-medium">{t("permessoStay")}</p>
              </Alert>
            ) : null}
            <p className="text-xs text-muted-foreground">{tc("basedOnEmbassy")}</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
