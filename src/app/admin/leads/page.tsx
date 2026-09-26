import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { leadAction } from "@/app/admin/actions";
import { ConvertLeadButton } from "@/components/admin/admin-widgets";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { EnumBadge } from "@/components/status-badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Leads" };

const STATUSES = ["NEW", "CONTACTED", "CONSULTATION", "INTERESTED", "REGISTERED", "LOST", "CONVERTED"];
const SOURCES = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "WHATSAPP", "REFERRAL", "WEBSITE", "WALK_IN", "OTHER"];

export default async function AdminLeads({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "leads.read");
  const locale = await getLocale();
  const t = await getTranslations("admin.leads");
  const te = await getTranslations("enums");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const [leads, cities, staff] = await Promise.all([
    db.lead.findMany({ where: status ? { status: status as never } : {}, orderBy: { createdAt: "desc" }, include: { assignedStaff: { include: { user: { select: { name: true } } } } } }),
    db.city.findMany({ orderBy: { name: "asc" } }),
    db.staffProfile.findMany({ include: { user: { select: { name: true } } } }),
  ]);
  const fields: FieldConfig[] = [
    { name: "firstName", label: t("firstName"), type: "text", required: true },
    { name: "lastName", label: t("lastName"), type: "text", required: true },
    { name: "phone", label: t("phone"), type: "text" },
    { name: "email", label: t("email"), type: "email" },
    { name: "preferredLocale", label: t("language"), type: "select", required: true, options: ["fr", "en", "ar", "it"].map((v) => ({ value: v, label: v })) },
    { name: "intendedDegree", label: t("degree"), type: "select", options: ["BACHELOR", "MASTER", "SINGLE_CYCLE", "PHD", "SPECIALIZATION"].map((v) => ({ value: v, label: te(`DegreeLevel.${v}` as never) })) },
    { name: "intendedCityId", label: t("city"), type: "select", options: cities.map((c) => ({ value: c.id, label: c.name })) },
    { name: "source", label: t("source"), type: "select", required: true, options: SOURCES.map((v) => ({ value: v, label: te(`LeadSource.${v}` as never) })) },
    { name: "status", label: t("status"), type: "select", required: true, options: STATUSES.map((v) => ({ value: v, label: te(`LeadStatus.${v}` as never) })) },
    { name: "assignedStaffId", label: t("assignedTo"), type: "select", options: staff.map((s) => ({ value: s.id, label: s.user.name })) },
    { name: "notes", label: t("notes"), type: "textarea" },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("add")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={leadAction.bind(null, undefined)} fields={fields} resetOnSuccess initial={{ firstName: "", lastName: "", phone: "", email: "", preferredLocale: "fr", intendedDegree: "", intendedCityId: "", source: "OTHER", status: "NEW", assignedStaffId: "", notes: "" }} />
        </div>
      </details>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[undefined, ...STATUSES].map((s) => (
          <a key={s ?? "all"} href={s ? `/admin/leads?status=${s}` : "/admin/leads"} className={`rounded-full border px-3 py-1 ${s === status ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
            {s ? te(`LeadStatus.${s}` as never) : t("all")}
          </a>
        ))}
      </div>
      {leads.length === 0 ? <EmptyState title={t("none")} /> : null}
      <div className="space-y-3">
        {leads.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <div>
                <CardTitle>{l.firstName} {l.lastName}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{[l.phone, l.email].filter(Boolean).join(" · ")} · {te(`LeadSource.${l.source}`)} · {formatDate(l.createdAt, locale)}{l.assignedStaff ? ` · ${l.assignedStaff.user.name}` : ""}</p>
              </div>
              <EnumBadge enumName="LeadStatus" value={l.status} />
            </CardHeader>
            <CardBody>
              <details>
                <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                <div className="mt-4 space-y-4">
                  <ConfigForm action={leadAction.bind(null, l.id)} fields={fields} initial={{ firstName: l.firstName, lastName: l.lastName, phone: l.phone ?? "", email: l.email ?? "", preferredLocale: l.preferredLocale, intendedDegree: l.intendedDegree ?? "", intendedCityId: l.intendedCityId ?? "", source: l.source, status: l.status, assignedStaffId: l.assignedStaffId ?? "", notes: l.notes ?? "" }} />
                  {l.status !== "CONVERTED" ? <ConvertLeadButton leadId={l.id} disabled={!l.email} /> : <p className="text-sm text-success">{t("converted")}</p>}
                  {!l.email && l.status !== "CONVERTED" ? <p className="text-xs text-muted-foreground">{t("needsEmail")}</p> : null}
                </div>
              </details>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
