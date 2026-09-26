import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { settingAction, stageAction, templateAction } from "@/app/admin/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettings() {
  const user = await requireArea("admin");
  await requirePermission(user, "settings.manage");
  const t = await getTranslations("admin.settings");
  const [agency, retention, stages, templates] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: "agency.info" } }),
    db.systemSetting.findUnique({ where: { key: "documents.retention" } }),
    db.caseStage.findMany({ orderBy: { sortOrder: "asc" } }),
    db.notificationTemplate.findMany({ orderBy: [{ type: "asc" }, { locale: "asc" }] }),
  ]);
  const a = (agency?.value ?? {}) as Record<string, string>;
  const r = (retention?.value ?? {}) as Record<string, string | number>;
  const agencyFields: FieldConfig[] = [
    { name: "name", label: t("agencyName"), type: "text", required: true },
    { name: "country", label: t("country"), type: "text", required: true },
    { name: "timezone", label: t("timezone"), type: "text", required: true },
    { name: "supportEmail", label: t("supportEmail"), type: "text", required: true },
    { name: "phone", label: t("phone"), type: "text" },
    { name: "address", label: t("address"), type: "text", wide: true },
  ];
  const stageFields: FieldConfig[] = [
    { name: "name", label: t("stageName"), type: "text", required: true },
    { name: "progressPercent", label: t("progress"), type: "number", required: true },
    { name: "active", label: t("active"), type: "checkbox" },
  ];
  const templateFields: FieldConfig[] = [
    { name: "type", label: t("templateType"), type: "text", required: true, hint: t("templateTypeHint") },
    { name: "locale", label: t("locale"), type: "select", required: true, options: ["fr", "en", "ar", "it"].map((v) => ({ value: v, label: v })) },
    { name: "title", label: t("templateTitle"), type: "text", required: true, wide: true },
    { name: "body", label: t("templateBody"), type: "textarea", required: true },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardHeader><CardTitle>{t("agency")}</CardTitle></CardHeader>
        <CardBody>
          <ConfigForm action={settingAction.bind(null, "agency.info")} fields={agencyFields} initial={{ name: a.name ?? "", country: a.country ?? "TN", timezone: a.timezone ?? "Africa/Tunis", supportEmail: a.supportEmail ?? "", phone: a.phone ?? "", address: a.address ?? "" }} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("retention")}</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("retentionNote")}</p>
          <ConfigForm action={settingAction.bind(null, "documents.retention")} fields={[{ name: "retentionMonths", label: t("retentionMonths"), type: "number", required: true }, { name: "note", label: t("notes"), type: "text", wide: true }]} initial={{ retentionMonths: String(r.retentionMonths ?? 60), note: String(r.note ?? "") }} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("stages")}</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          {stages.map((s) => (
            <details key={s.id} className="rounded-md border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm">{s.sortOrder + 1}. {s.name} <span className="text-muted-foreground">({s.progressPercent}%){s.active ? "" : ` — ${t("inactive")}`}</span></summary>
              <div className="mt-3"><ConfigForm action={stageAction.bind(null, s.id)} fields={stageFields} initial={{ name: s.name, progressPercent: String(s.progressPercent), active: s.active }} /></div>
            </details>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("templates")}</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <ul className="space-y-1 text-sm">
            {templates.length === 0 ? <li className="text-muted-foreground">{t("noTemplates")}</li> : null}
            {templates.map((x) => <li key={x.id}><span className="font-medium">{x.type}</span> · {x.locale} — {x.title}</li>)}
          </ul>
          <ConfigForm action={templateAction} fields={templateFields} resetOnSuccess initial={{ type: "", locale: "fr", title: "", body: "" }} submitLabel={t("saveTemplate")} />
        </CardBody>
      </Card>
    </div>
  );
}
