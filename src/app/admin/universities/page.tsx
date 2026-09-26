import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { universityAction } from "@/app/admin/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Universities" };

export default async function AdminUniversities() {
  const user = await requireArea("admin");
  await requirePermission(user, "universities.manage");
  const t = await getTranslations("admin.universities");
  const [unis, cities] = await Promise.all([
    db.university.findMany({ include: { city: { include: { region: true } }, _count: { select: { programs: true } } }, orderBy: { name: "asc" } }),
    db.city.findMany({ include: { region: true }, orderBy: { name: "asc" } }),
  ]);
  const fields: FieldConfig[] = [
    { name: "name", label: t("name"), type: "text", required: true, wide: true },
    { name: "cityId", label: t("city"), type: "select", required: true, options: cities.map((c) => ({ value: c.id, label: `${c.name} (${c.region.name})` })) },
    { name: "website", label: t("website"), type: "text" },
    { name: "visaAppointmentDeadline", label: t("visaDeadline"), type: "date", hint: t("visaDeadlineHint") },
    { name: "active", label: t("active"), type: "checkbox" },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("add")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={universityAction.bind(null, undefined)} fields={fields} resetOnSuccess initial={{ name: "", cityId: "", website: "", visaAppointmentDeadline: "", active: true }} />
        </div>
      </details>
      <div className="space-y-3">
        {unis.map((u) => (
          <Card key={u.id}>
            <CardHeader>
              <div>
                <CardTitle>{u.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{u.city.name}, {u.city.region.name} · {t("programs", { n: u._count.programs })}</p>
              </div>
              {!u.active ? <Badge tone="danger">{t("inactive")}</Badge> : null}
            </CardHeader>
            <CardBody>
              <details>
                <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                <div className="mt-4">
                  <ConfigForm action={universityAction.bind(null, u.id)} fields={fields} initial={{ name: u.name, cityId: u.cityId, website: u.website ?? "", visaAppointmentDeadline: u.visaAppointmentDeadline ? toISODate(u.visaAppointmentDeadline) : "", active: u.active }} />
                </div>
              </details>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
