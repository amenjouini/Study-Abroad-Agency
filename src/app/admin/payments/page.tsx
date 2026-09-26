import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { planAction, planItemAction } from "@/app/admin/actions";
import { RemovePlanItem } from "@/components/admin/admin-widgets";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatMoney, money } from "@/lib/money";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPayments() {
  const user = await requireArea("admin");
  await requirePermission(user, "payments.plans");
  const locale = await getLocale();
  const t = await getTranslations("admin.payments");
  const plans = await db.paymentPlan.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } });
  const planFields: FieldConfig[] = [
    { name: "name", label: t("name"), type: "text", required: true },
    { name: "currency", label: t("currency"), type: "select", required: true, options: [{ value: "TND", label: "TND (3 decimals)" }, { value: "EUR", label: "EUR (2 decimals)" }] },
    { name: "isDefault", label: t("isDefault"), type: "checkbox" },
    { name: "active", label: t("active"), type: "checkbox" },
  ];
  const itemFields: FieldConfig[] = [
    { name: "name", label: t("itemName"), type: "text", required: true },
    { name: "amount", label: t("amount"), type: "text", required: true },
    { name: "dueOffsetDays", label: t("dueOffset"), type: "number", hint: t("dueOffsetHint") },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("addPlan")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={planAction.bind(null, undefined)} fields={planFields} resetOnSuccess initial={{ name: "", currency: "TND", isDefault: false, active: true }} />
        </div>
      </details>
      <div className="space-y-4">
        {plans.map((p) => {
          const total = p.items.reduce((s, i) => s + i.amountMinor, 0);
          return (
            <Card key={p.id}>
              <CardHeader>
                <div>
                  <CardTitle>{p.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("total")}: {formatMoney(money(total, p.currency), locale)}</p>
                </div>
                <div className="flex gap-1">{p.isDefault ? <Badge tone="primary">{t("default")}</Badge> : null}{!p.active ? <Badge tone="danger">{t("inactive")}</Badge> : null}</div>
              </CardHeader>
              <CardBody className="space-y-4">
                <ul className="divide-y divide-border rounded-md border border-border">
                  {p.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>{i.name}<span className="block text-xs text-muted-foreground">{t("dueIn", { n: i.dueOffsetDays })}</span></span>
                      <span className="flex items-center gap-2"><span className="tabular-nums">{formatMoney(money(i.amountMinor, p.currency), locale)}</span><RemovePlanItem itemId={i.id} /></span>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary className="cursor-pointer text-sm text-primary">{t("addItem")}</summary>
                  <div className="mt-3"><ConfigForm action={planItemAction.bind(null, p.id)} fields={itemFields} resetOnSuccess initial={{ name: "", amount: "", dueOffsetDays: "0" }} /></div>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm text-primary">{t("editPlan")}</summary>
                  <div className="mt-3"><ConfigForm action={planAction.bind(null, p.id)} fields={planFields} initial={{ name: p.name, currency: p.currency, isDefault: p.isDefault, active: p.active }} /></div>
                </details>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
