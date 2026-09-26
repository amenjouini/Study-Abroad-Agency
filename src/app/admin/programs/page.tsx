import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { programAction } from "@/app/admin/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { toDecimalString, money } from "@/lib/money";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Programs" };

export default async function AdminPrograms() {
  const user = await requireArea("admin");
  await requirePermission(user, "universities.manage");
  const t = await getTranslations("admin.programs");
  const te = await getTranslations("enums");
  const [programs, unis, years] = await Promise.all([
    db.universityProgram.findMany({ include: { university: true, academicYear: true }, orderBy: [{ university: { name: "asc" } }, { name: "asc" }] }),
    db.university.findMany({ orderBy: { name: "asc" } }),
    db.academicYear.findMany({ orderBy: { startYear: "desc" } }),
  ]);
  const fields: FieldConfig[] = [
    { name: "name", label: t("name"), type: "text", required: true, wide: true },
    { name: "universityId", label: t("university"), type: "select", required: true, options: unis.map((u) => ({ value: u.id, label: u.name })) },
    { name: "academicYearId", label: t("year"), type: "select", required: true, options: years.map((y) => ({ value: y.id, label: y.label })) },
    { name: "degreeLevel", label: t("degree"), type: "select", required: true, options: ["BACHELOR", "MASTER", "SINGLE_CYCLE", "PHD", "SPECIALIZATION"].map((v) => ({ value: v, label: te(`DegreeLevel.${v}` as never) })) },
    { name: "language", label: t("language"), type: "select", required: true, options: [{ value: "IT", label: te("TeachingLanguage.IT") }, { value: "EN", label: te("TeachingLanguage.EN") }] },
    { name: "durationMonths", label: t("duration"), type: "number", required: true, hint: t("durationHint") },
    { name: "applicationDeadline", label: t("applicationDeadline"), type: "date" },
    { name: "visaAppointmentDeadline", label: t("visaDeadline"), type: "date", hint: t("visaDeadlineHint") },
    { name: "applicationFee", label: t("fee"), type: "text" },
    { name: "applicationFeeCurrency", label: t("feeCurrency"), type: "select", options: [{ value: "EUR", label: "EUR" }, { value: "TND", label: "TND" }] },
    { name: "active", label: t("active"), type: "checkbox" },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("add")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={programAction.bind(null, undefined)} fields={fields} resetOnSuccess initial={{ name: "", universityId: "", academicYearId: years.find((y) => y.isCurrent)?.id ?? "", degreeLevel: "MASTER", language: "EN", durationMonths: "24", applicationDeadline: "", visaAppointmentDeadline: "", applicationFee: "", applicationFeeCurrency: "", active: true }} />
        </div>
      </details>
      <div className="space-y-3">
        {programs.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div>
                <CardTitle>{p.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.university.name} · {p.academicYear.label} · {te(`DegreeLevel.${p.degreeLevel}`)} · {te(`TeachingLanguage.${p.language}`)} · {t("months", { n: p.durationMonths })}</p>
              </div>
              {!p.active ? <Badge tone="danger">{t("inactive")}</Badge> : null}
            </CardHeader>
            <CardBody>
              <details>
                <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                <div className="mt-4">
                  <ConfigForm action={programAction.bind(null, p.id)} fields={fields} initial={{ name: p.name, universityId: p.universityId, academicYearId: p.academicYearId, degreeLevel: p.degreeLevel, language: p.language, durationMonths: String(p.durationMonths), applicationDeadline: p.applicationDeadline ? toISODate(p.applicationDeadline) : "", visaAppointmentDeadline: p.visaAppointmentDeadline ? toISODate(p.visaAppointmentDeadline) : "", applicationFee: p.applicationFeeMinor != null && p.applicationFeeCurrency ? toDecimalString(money(p.applicationFeeMinor, p.applicationFeeCurrency)) : "", applicationFeeCurrency: p.applicationFeeCurrency ?? "", active: p.active }} />
                </div>
              </details>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
