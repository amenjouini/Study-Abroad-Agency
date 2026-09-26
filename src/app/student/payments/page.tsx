import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, money } from "@/lib/money";
import { computePaymentStatus, nextPayment, summarizePayments } from "@/lib/payments";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function StudentPayments() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.payments");
  const caseId = await ownCaseId(user);
  const payments = await db.payment.findMany({ where: { caseId }, include: { transactions: { orderBy: { paidAt: "desc" } } }, orderBy: { sortOrder: "asc" } });
  const today = todayISO();
  const rows = payments.map((p) => {
    const paid = p.transactions.reduce((s, x) => s + x.amountMinor, 0);
    const due = p.dueDate ? toISODate(p.dueDate) : null;
    const cancelled = p.status === "CANCELLED";
    return { ...p, paidMinor: paid, dueIso: due, cancelled, shown: computePaymentStatus({ amountMinor: p.amountMinor, currency: p.currency, paidMinor: paid, dueDate: due, cancelled }, today) };
  });
  const totals = summarizePayments(rows.map((r) => ({ amountMinor: r.amountMinor, currency: r.currency, paidMinor: r.paidMinor, cancelled: r.cancelled })));
  const next = nextPayment(rows.map((r) => ({ amountMinor: r.amountMinor, currency: r.currency, paidMinor: r.paidMinor, dueDate: r.dueIso, sortOrder: r.sortOrder, cancelled: r.cancelled, name: r.name })));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} description={t("description")} />
      <Alert tone="info" className="mb-5">
        {t("noOnline")}
      </Alert>
      {rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {totals.map((tot) => (
              <Card key={tot.currency} className="p-4 sm:col-span-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("total")}</p>
                    <p className="text-xl font-semibold tabular-nums">{formatMoney(tot.total, locale)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("paid")}</p>
                    <p className="text-xl font-semibold tabular-nums text-success">{formatMoney(tot.paid, locale)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("remaining")}</p>
                    <p className="text-xl font-semibold tabular-nums">{formatMoney(tot.remaining, locale)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {next ? (
            <Alert tone="warning" title={t("nextPayment")}>
              {next.name} — {formatMoney(money(next.amountMinor - next.paidMinor, next.currency), locale)}
              {next.dueDate ? ` · ${t("dueOn", { date: formatDate(next.dueDate, locale) })}` : ""}
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t("schedule")}</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(money(r.paidMinor, r.currency), locale)} / {formatMoney(money(r.amountMinor, r.currency), locale)}
                        {r.dueIso ? ` · ${t("dueOn", { date: formatDate(r.dueIso, locale) })}` : ""}
                      </p>
                    </div>
                    <EnumBadge enumName="PaymentStatus" value={r.shown} />
                  </div>
                  {r.transactions.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-s-2 border-border ps-3 text-xs text-muted-foreground">
                      {r.transactions.map((x) => (
                        <li key={x.id}>
                          {formatDate(x.paidAt, locale)} · {formatMoney(money(x.amountMinor, x.currency), locale)} · {x.method}
                          {x.reference ? ` · ${x.reference}` : ""}
                          {x.receiptStorageKey ? (
                            <>
                              {" · "}
                              <a className="text-primary hover:underline" href={`/api/payments/receipt/${x.id}`} target="_blank" rel="noreferrer">
                                {t("receipt")}
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <CardBody className="text-xs text-muted-foreground">{t("history")}</CardBody>
        </div>
      )}
    </div>
  );
}
