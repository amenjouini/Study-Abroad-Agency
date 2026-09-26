import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney, money } from "@/lib/money";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";
import { AddScholarshipButton, ScholarshipStatusButtons } from "../applications/forms";

export const metadata: Metadata = { title: "Scholarships" };

export default async function StudentScholarships() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.scholarships");
  const caseId = await ownCaseId(user);
  const [mine, available] = await Promise.all([
    db.scholarshipApplication.findMany({ where: { caseId }, include: { scholarshipVersion: { include: { scholarship: true, academicYear: true } } }, orderBy: { createdAt: "asc" } }),
    db.scholarshipVersion.findMany({ where: { academicYear: { isCurrent: true }, scholarship: { active: true } }, include: { scholarship: { include: { region: true } }, academicYear: true } }),
  ]);
  const trackedIds = new Set(mine.filter((m) => m.status !== "WITHDRAWN").map((m) => m.scholarshipVersionId));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("mine")}</h2>
        {mine.length === 0 ? <EmptyState title={t("noneTracked")} /> : null}
        {mine.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <div>
                <CardTitle>{m.scholarshipVersion.scholarship.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.scholarshipVersion.academicYear.label}</p>
              </div>
              <EnumBadge enumName="ScholarshipApplicationStatus" value={m.status} />
            </CardHeader>
            <CardBody className="space-y-3">
              {m.submittedAt ? <p className="text-sm text-muted-foreground">{t("submittedOn", { date: formatDate(m.submittedAt, locale) })}</p> : null}
              {m.awardedAmountMinor != null && m.awardedCurrency ? <p className="text-sm font-medium">{t("awarded", { amount: formatMoney(money(m.awardedAmountMinor, m.awardedCurrency), locale) })}</p> : null}
              <ScholarshipStatusButtons id={m.id} status={m.status} />
            </CardBody>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("available")}</h2>
        {available.map((v) => {
          const benefits = Array.isArray(v.benefits) ? (v.benefits as string[]) : [];
          return (
            <Card key={v.id}>
              <CardHeader>
                <div>
                  <CardTitle>{v.scholarship.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {v.scholarship.region?.name ?? ""} · {v.academicYear.label}
                  </p>
                </div>
              </CardHeader>
              <CardBody className="space-y-3 text-sm">
                {v.deadline ? <p><span className="font-medium">{t("deadline")}:</span> {formatDateTime(v.deadline, locale, "Europe/Rome")} ({t("italyTime")})</p> : null}
                {v.eligibility ? <p><span className="font-medium">{t("eligibility")}:</span> {v.eligibility}</p> : null}
                {v.iseeMaxMinor != null && v.ispeMaxMinor != null && v.thresholdCurrency ? (
                  <p>
                    <span className="font-medium">{t("thresholds")}:</span> ISEE ≤ {formatMoney(money(v.iseeMaxMinor, v.thresholdCurrency), locale)} · ISPE ≤ {formatMoney(money(v.ispeMaxMinor, v.thresholdCurrency), locale)}
                  </p>
                ) : null}
                {benefits.length ? (
                  <div>
                    <p className="font-medium">{t("benefits")}</p>
                    <ul className="ms-5 list-disc text-muted-foreground">
                      {benefits.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  </div>
                ) : null}
                {v.notes ? <p className="text-xs text-muted-foreground">{v.notes}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  {v.sourceUrl ? (
                    <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      {t("officialSource")}
                    </a>
                  ) : <span />}
                  {trackedIds.has(v.id) ? <span className="text-xs text-success">{t("tracked")}</span> : <AddScholarshipButton versionId={v.id} />}
                </div>
              </CardBody>
            </Card>
          );
        })}
        {available.length === 0 ? <EmptyState title={t("noneAvailable")} /> : null}
      </section>
    </div>
  );
}
