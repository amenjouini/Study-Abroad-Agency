import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { scholarshipAction, scholarshipVersionAction } from "@/app/admin/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatMoney, money, toDecimalString } from "@/lib/money";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Scholarships" };

export default async function AdminScholarships() {
  const user = await requireArea("admin");
  await requirePermission(user, "scholarships.manage");
  const locale = await getLocale();
  const t = await getTranslations("admin.scholarships");
  const te = await getTranslations("enums");
  const [list, regions, years] = await Promise.all([
    db.scholarship.findMany({ include: { region: true, versions: { include: { academicYear: true }, orderBy: { academicYear: { startYear: "desc" } } } }, orderBy: { name: "asc" } }),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.academicYear.findMany({ orderBy: { startYear: "desc" } }),
  ]);
  const sFields: FieldConfig[] = [
    { name: "name", label: t("name"), type: "text", required: true, wide: true },
    { name: "kind", label: t("kind"), type: "select", required: true, options: ["ITALIAN_GOVERNMENT", "REGIONAL", "UNIVERSITY", "OTHER"].map((v) => ({ value: v, label: te(`ScholarshipKind.${v}` as never) })), hint: t("kindHint") },
    { name: "regionId", label: t("region"), type: "select", options: regions.map((r) => ({ value: r.id, label: r.name })) },
    { name: "officialUrl", label: t("url"), type: "text", wide: true },
    { name: "active", label: t("active"), type: "checkbox" },
  ];
  const vFields: FieldConfig[] = [
    { name: "academicYearId", label: t("year"), type: "select", required: true, options: years.map((y) => ({ value: y.id, label: y.label })) },
    { name: "deadline", label: t("deadline"), type: "datetime-local" },
    { name: "openingDate", label: t("opening"), type: "datetime-local" },
    { name: "iseeMax", label: t("isee"), type: "text" },
    { name: "ispeMax", label: t("ispe"), type: "text" },
    { name: "amount", label: t("amount"), type: "text" },
    { name: "currency", label: t("currency"), type: "select", required: true, options: [{ value: "EUR", label: "EUR" }, { value: "TND", label: "TND" }] },
    { name: "eligibility", label: t("eligibility"), type: "textarea" },
    { name: "benefits", label: t("benefits"), type: "textarea", hint: t("benefitsHint") },
    { name: "sourceName", label: t("sourceName"), type: "text" },
    { name: "sourceUrl", label: t("sourceUrl"), type: "text" },
    { name: "notes", label: t("notes"), type: "textarea" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("add")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={scholarshipAction.bind(null, undefined)} fields={sFields} resetOnSuccess initial={{ name: "", kind: "REGIONAL", regionId: "", officialUrl: "", active: true }} />
        </div>
      </details>
      <div className="space-y-4">
        {list.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <div>
                <CardTitle>{s.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{te(`ScholarshipKind.${s.kind}`)}{s.region ? ` · ${s.region.name}` : ""}</p>
              </div>
              {!s.active ? <Badge tone="danger">{t("inactive")}</Badge> : null}
            </CardHeader>
            <CardBody className="space-y-4">
              <details>
                <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                <div className="mt-4">
                  <ConfigForm action={scholarshipAction.bind(null, s.id)} fields={sFields} initial={{ name: s.name, kind: s.kind, regionId: s.regionId ?? "", officialUrl: s.officialUrl ?? "", active: s.active }} />
                </div>
              </details>
              <div>
                <p className="mb-2 text-sm font-semibold">{t("versions")}</p>
                <ul className="space-y-2">
                  {s.versions.map((v) => (
                    <li key={v.id} className="rounded-md border border-border p-3 text-sm">
                      <p className="font-medium">{v.academicYear.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.deadline ? `${t("deadline")}: ${formatDateTime(v.deadline, locale, "Europe/Rome")} · ` : ""}
                        {v.iseeMaxMinor != null && v.thresholdCurrency ? `ISEE ≤ ${formatMoney(money(v.iseeMaxMinor, v.thresholdCurrency), locale)} · ` : ""}
                        {v.ispeMaxMinor != null && v.thresholdCurrency ? `ISPE ≤ ${formatMoney(money(v.ispeMaxMinor, v.thresholdCurrency), locale)}` : ""}
                      </p>
                      {v.sourceUrl ? <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{v.sourceName ?? v.sourceUrl}</a> : null}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary">{t("editVersion")}</summary>
                        <div className="mt-3">
                          <ConfigForm
                            action={scholarshipVersionAction.bind(null, s.id, v.id)}
                            fields={vFields}
                            initial={{
                                              academicYearId: v.academicYearId,
                              deadline: v.deadline ? v.deadline.toISOString().slice(0, 16) : "",
                              openingDate: v.openingDate ? v.openingDate.toISOString().slice(0, 16) : "",
                              iseeMax: v.iseeMaxMinor != null && v.thresholdCurrency ? toDecimalString(money(v.iseeMaxMinor, v.thresholdCurrency)) : "",
                              ispeMax: v.ispeMaxMinor != null && v.thresholdCurrency ? toDecimalString(money(v.ispeMaxMinor, v.thresholdCurrency)) : "",
                              amount: v.amountMinor != null && v.amountCurrency ? toDecimalString(money(v.amountMinor, v.amountCurrency)) : "",
                              currency: v.thresholdCurrency ?? v.amountCurrency ?? "EUR",
                              eligibility: v.eligibility ?? "",
                              benefits: Array.isArray(v.benefits) ? (v.benefits as string[]).join("\n") : "",
                              sourceName: v.sourceName ?? "",
                              sourceUrl: v.sourceUrl ?? "",
                              notes: v.notes ?? "",
                            }}
                          />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary">{t("addVersion")}</summary>
                  <div className="mt-3">
                    <ConfigForm action={scholarshipVersionAction.bind(null, s.id, undefined)} fields={vFields} resetOnSuccess initial={{ academicYearId: years.find((y) => y.isCurrent)?.id ?? "", deadline: "", openingDate: "", iseeMax: "", ispeMax: "", amount: "", currency: "EUR", eligibility: "", benefits: "", sourceName: "", sourceUrl: "", notes: "" }} />
                  </div>
                </details>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
