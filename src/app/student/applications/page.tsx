import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";
import { AddApplicationForm, ApplicationStatusButtons, UniversitalyForm } from "./forms";

export const metadata: Metadata = { title: "Applications" };

export default async function StudentApplications() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.applications");
  const te = await getTranslations("enums");
  const caseId = await ownCaseId(user);
  const [apps, programs] = await Promise.all([
    db.universityApplication.findMany({
      where: { caseId },
      include: { university: { include: { city: true } }, program: true, universitaly: true, visa: true },
      orderBy: { createdAt: "asc" },
    }),
    db.universityProgram.findMany({ where: { active: true, academicYear: { isCurrent: true } }, include: { university: { include: { city: true } } }, orderBy: [{ university: { name: "asc" } }, { name: "asc" }] }),
  ]);
  const taken = new Set(apps.filter((a) => !["WITHDRAWN", "REJECTED"].includes(a.status)).map((a) => a.programId));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      {apps.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {apps.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <div>
              <CardTitle>{a.university.name}</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {a.program.name} · {a.university.city.name} · {te(`DegreeLevel.${a.program.degreeLevel}`)} · {te(`TeachingLanguage.${a.program.language}`)}
              </p>
            </div>
            <EnumBadge enumName="ApplicationStatus" value={a.status} />
          </CardHeader>
          <CardBody className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {a.deadline ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("deadline")}</dt>
                  <dd>{formatDate(a.deadline, locale)}</dd>
                </div>
              ) : null}
              {a.admissionResult ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("admissionResult")}</dt>
                  <dd>{a.admissionResult}</dd>
                </div>
              ) : null}
              {a.conditions ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("conditions")}</dt>
                  <dd>{a.conditions}</dd>
                </div>
              ) : null}
            </dl>
            <ApplicationStatusButtons applicationId={a.id} programId={a.programId} status={a.status} />

            {["ACCEPTED", "ENROLLED"].includes(a.status) || a.universitaly ? (
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Universitaly</p>
                  {a.universitaly ? <EnumBadge enumName="UniversitalyStatus" value={a.universitaly.status} /> : <Badge>{te("UniversitalyStatus.NOT_STARTED")}</Badge>}
                </div>
                <UniversitalyForm applicationId={a.id} contactEmail={a.universitaly?.contactEmail ?? ""} referenceId={a.universitaly?.referenceId ?? ""} />
                <Alert tone="warning" className="mt-3">
                  {t("universitalyWarning")}
                </Alert>
                {a.universitaly?.correctionsRequested ? (
                  <Alert tone="danger" title={t("correctionsRequested")} className="mt-3">
                    {a.universitaly.correctionsRequested}
                  </Alert>
                ) : null}
              </div>
            ) : null}
            {a.visa ? (
              <p className="text-sm">
                <Link href="/student/visa" className="font-medium text-primary hover:underline">
                  {t("seeVisa")}
                </Link>
              </p>
            ) : null}
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardBody>
          <AddApplicationForm programs={programs.filter((p) => !taken.has(p.id)).map((p) => ({ id: p.id, label: `${p.university.name} — ${p.name} (${p.university.city.name})` }))} />
          <p className="mt-3 text-xs text-muted-foreground">{t("noGuarantee")}</p>
        </CardBody>
      </Card>
    </div>
  );
}
