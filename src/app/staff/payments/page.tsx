import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, money } from "@/lib/money";
import { caseAccessWhere } from "@/server/authz";
import { markLatePayments } from "@/server/payments";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

export default async function StaffPayments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireArea("staff");
  const locale = await getLocale();
  const t = await getTranslations("staff.payments");
  const te = await getTranslations("enums");
  const sp = await searchParams;
  await markLatePayments();
  const status = ["PENDING", "PARTIALLY_PAID", "PAID", "LATE"].includes(sp.status ?? "") ? sp.status : undefined;
  const payments = await db.payment.findMany({
    where: { case: await caseAccessWhere(user, "payments.read"), status: (status as never) ?? { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
    include: { case: { include: { student: true } }, transactions: true },
  });
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[undefined, "LATE", "PENDING", "PARTIALLY_PAID", "PAID"].map((s) => (
          <Link key={s ?? "all"} href={s ? `/staff/payments?status=${s}` : "/staff/payments"} className={`rounded-full border px-3 py-1 ${s === status ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
            {s ? te(`PaymentStatus.${s}` as never) : t("all")}
          </Link>
        ))}
      </div>
      {payments.length === 0 ? (
        <EmptyState title={t("none")} />
      ) : (
        <Table>
          <thead>
            <tr><Th>{t("student")}</Th><Th>{t("payment")}</Th><Th>{t("amount")}</Th><Th>{t("paid")}</Th><Th>{t("due")}</Th><Th>{t("status")}</Th></tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const paid = p.transactions.reduce((s, x) => s + x.amountMinor, 0);
              return (
                <tr key={p.id}>
                  <Td><Link className="font-medium text-primary hover:underline" href={`/staff/students/${p.caseId}?tab=payments`}>{p.case.student.firstName} {p.case.student.lastName}</Link></Td>
                  <Td>{p.name}</Td>
                  <Td className="tabular-nums">{formatMoney(money(p.amountMinor, p.currency), locale)}</Td>
                  <Td className="tabular-nums">{formatMoney(money(paid, p.currency), locale)}</Td>
                  <Td className="text-xs">{p.dueDate ? formatDate(toISODate(p.dueDate), locale) : "—"}</Td>
                  <Td><EnumBadge enumName="PaymentStatus" value={p.status} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
