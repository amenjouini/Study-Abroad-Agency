import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deadlineAction, parameterAction } from "@/app/admin/procedures/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { MigrateCase } from "@/components/admin/procedure-widgets";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Procedure version" };

const TABS = ["requirements", "deadlines", "parameters", "cases"] as const;

export default async function ProcedureVersionPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "procedures.manage");
  const locale = await getLocale();
  const t = await getTranslations("admin.procedures");
  const { versionId } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "requirements";
  const v = await db.procedureVersion.findUnique({
    where: { id: versionId },
    include: { academicYear: true, procedure: true, requirements: { orderBy: { sortOrder: "asc" } }, deadlines: { orderBy: { code: "asc" } }, parameters: { orderBy: { key: "asc" } } },
  });
  if (!v) notFound();
  const readOnly = v.status === "ARCHIVED";

  const deadlineFields: FieldConfig[] = [
    { name: "code", label: t("code"), type: "text", required: true, hint: t("codeHint") },
    { name: "name", label: t("name"), type: "text", required: true },
    { name: "kind", label: t("kind"), type: "select", required: true, options: [{ value: "FIXED_DATE", label: t("fixedDate") }, { value: "OFFSET", label: t("offset") }] },
    { name: "fixedDate", label: t("fixedDate"), type: "date" },
    { name: "offsetBasis", label: t("offsetBasis"), type: "text", hint: "visa.arrivalDate" },
    { name: "offsetDays", label: t("offsetDays"), type: "number" },
    { name: "dayType", label: t("dayType"), type: "select", required: true, options: [{ value: "CALENDAR_DAYS", label: "CALENDAR_DAYS" }, { value: "WORKING_DAYS", label: "WORKING_DAYS" }] },
    { name: "holidayCountryCode", label: t("holidays"), type: "text", hint: "IT" },
    { name: "reminderDays", label: t("reminders"), type: "text", hint: "30, 14, 7, 3, 1" },
    { name: "priority", label: t("priority"), type: "select", required: true, options: ["NORMAL", "HIGH", "URGENT"].map((x) => ({ value: x, label: x })) },
    { name: "legalBasis", label: t("legalBasis"), type: "text" },
    { name: "sourceUrl", label: t("sourceUrl"), type: "text", wide: true },
  ];
  const paramFields: FieldConfig[] = [
    { name: "key", label: t("key"), type: "text", required: true },
    { name: "value", label: t("valueJson"), type: "textarea", required: true, hint: t("valueHint") },
    { name: "description", label: t("descriptionField"), type: "text", wide: true },
  ];

  let casesTab: React.ReactNode = null;
  if (tab === "cases") {
    const others = await db.case.findMany({ where: { procedureVersionId: { not: v.id }, procedureVersion: { procedureId: v.procedureId } }, include: { student: true, procedureVersion: { include: { academicYear: true } } }, take: 50, orderBy: { createdAt: "desc" } });
    casesTab = (
      <Card>
        <CardHeader><CardTitle>{t("migrateTitle")}</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("migrateHelp")}</p>
          {readOnly ? <p className="text-sm text-danger">{t("archivedNoMigrate")}</p> : others.length === 0 ? <EmptyState title={t("noOtherCases")} /> : others.map((c) => (
            <div key={c.id} className="border-b border-border pb-3 last:border-0">
              <MigrateCase caseId={c.id} toVersionId={v.id} label={`${c.student.firstName} ${c.student.lastName} — ${c.procedureVersion.academicYear.label} v${c.procedureVersion.versionNumber}`} />
            </div>
          ))}
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={`${v.procedure.name}`} description={`${v.academicYear.label} · v${v.versionNumber}`} actions={<Badge tone={v.status === "ACTIVE" ? "success" : v.status === "DRAFT" ? "warning" : "neutral"}>{v.status}</Badge>} />
      {v.status === "ACTIVE" ? <p className="mb-4 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-sm">{t("activeWarning")}</p> : null}
      <nav className="mb-5 flex gap-1 border-b border-border pb-2">
        {TABS.map((k) => (
          <Link key={k} href={`/admin/procedures/${v.id}?tab=${k}`} className={`rounded-md px-3 py-1.5 text-sm ${k === tab ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>{t(`tabs.${k}`)}</Link>
        ))}
      </nav>

      {tab === "requirements" ? (
        <Card>
          <ul className="divide-y divide-border">
            {v.requirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <Link href={`/admin/document-rules/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>
                  <span className="block font-mono text-xs text-muted-foreground">{r.code} · {r.subjectType} · {r.kind}{r.ruleGroupId ? "" : ` · ${t("always")}`}</span>
                </span>
                <span className="flex gap-1">{!r.mandatory ? <Badge>{t("optional")}</Badge> : null}{r.sourceUrl ? <a className="text-xs text-primary hover:underline" href={r.sourceUrl} target="_blank" rel="noreferrer">{t("source")}</a> : null}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tab === "deadlines" ? (
        <div className="space-y-4">
          {v.deadlines.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div>
                  <CardTitle>{d.name}</CardTitle>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{d.code} · {d.kind === "FIXED_DATE" ? (d.fixedDate ? formatDate(d.fixedDate, locale) : "—") : `${d.offsetBasis} + ${d.offsetDays} ${d.dayType}`}{d.legalBasis ? ` · ${d.legalBasis}` : ""}</p>
                </div>
                <Badge>{d.priority}</Badge>
              </CardHeader>
              {!readOnly ? (
                <CardBody>
                  <details>
                    <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                    <div className="mt-3">
                      <ConfigForm action={deadlineAction.bind(null, v.id)} fields={deadlineFields} initial={{ code: d.code, name: d.name, kind: d.kind, fixedDate: d.fixedDate ? toISODate(d.fixedDate) : "", offsetBasis: d.offsetBasis ?? "", offsetDays: d.offsetDays != null ? String(d.offsetDays) : "", dayType: d.dayType, holidayCountryCode: d.holidayCountryCode ?? "", reminderDays: d.reminderDays.join(", "), priority: d.priority, legalBasis: d.legalBasis ?? "", sourceUrl: d.sourceUrl ?? "" }} />
                    </div>
                  </details>
                </CardBody>
              ) : null}
            </Card>
          ))}
          {!readOnly ? (
            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("addDeadline")}</summary>
              <div className="border-t border-border p-4">
                <ConfigForm action={deadlineAction.bind(null, v.id)} fields={deadlineFields} resetOnSuccess initial={{ code: "", name: "", kind: "FIXED_DATE", fixedDate: "", offsetBasis: "", offsetDays: "", dayType: "CALENDAR_DAYS", holidayCountryCode: "", reminderDays: "", priority: "NORMAL", legalBasis: "", sourceUrl: "" }} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "parameters" ? (
        <div className="space-y-4">
          <Card>
            <ul className="divide-y divide-border">
              {v.parameters.map((p) => (
                <li key={p.id} className="px-4 py-3 text-sm">
                  <p className="font-mono text-xs font-semibold">{p.key}</p>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted/60 p-2 text-xs">{JSON.stringify(p.value, null, 1)}</pre>
                  {p.description ? <p className="mt-1 text-xs text-muted-foreground">{p.description}</p> : null}
                  {!readOnly ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">{t("edit")}</summary>
                      <div className="mt-2"><ConfigForm action={parameterAction.bind(null, v.id)} fields={paramFields} initial={{ key: p.key, value: JSON.stringify(p.value), description: p.description ?? "" }} /></div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          {!readOnly ? (
            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("addParameter")}</summary>
              <div className="border-t border-border p-4"><ConfigForm action={parameterAction.bind(null, v.id)} fields={paramFields} resetOnSuccess initial={{ key: "", value: "", description: "" }} /></div>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "cases" ? casesTab : null}
    </>
  );
}
