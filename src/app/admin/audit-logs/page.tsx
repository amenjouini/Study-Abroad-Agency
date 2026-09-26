import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AdminAuditLogs({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; user?: string; page?: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "audit.view");
  const locale = await getLocale();
  const t = await getTranslations("admin.audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.action ? { action: { contains: sp.action, mode: "insensitive" as const } } : {}),
    ...(sp.entity ? { entity: { equals: sp.entity } } : {}),
    ...(sp.user ? { userId: sp.user } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    db.auditLog.count({ where }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const link = (p: number) => `/admin/audit-logs?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(sp.entity ? { entity: sp.entity } : {}), ...(sp.user ? { user: sp.user } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title={t("title")} description={t("description", { n: total })} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-xs text-muted-foreground">{t("action")}<Input name="action" defaultValue={sp.action ?? ""} className="mt-1 h-9 w-56" placeholder="document.approve" /></label>
        <label className="text-xs text-muted-foreground">{t("entity")}<Input name="entity" defaultValue={sp.entity ?? ""} className="mt-1 h-9 w-44" placeholder="DocumentVersion" /></label>
        <Button type="submit" size="sm">{t("filter")}</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={t("none")} />
      ) : (
        <Table>
          <thead><tr><Th>{t("when")}</Th><Th>{t("who")}</Th><Th>{t("action")}</Th><Th>{t("entity")}</Th><Th>{t("details")}</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, locale)}</Td>
                <Td className="text-xs">{r.userId ? (nameOf.get(r.userId) ?? r.userId) : "—"}{r.ipAddress ? <span className="block text-muted-foreground">{r.ipAddress}</span> : null}</Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td className="text-xs">{r.entity}{r.entityId ? <span className="block text-muted-foreground">{r.entityId.slice(0, 12)}</span> : null}{r.caseId ? <Link className="block text-primary hover:underline" href={`/staff/students/${r.caseId}?tab=timeline`}>{t("case")}</Link> : null}</Td>
                <Td className="max-w-xs truncate font-mono text-[11px] text-muted-foreground" title={r.metadata ? JSON.stringify(r.metadata) : undefined}>{r.metadata ? JSON.stringify(r.metadata) : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? <Link className="text-primary hover:underline" href={link(page - 1)}>← {t("newer")}</Link> : <span />}
        {page * PAGE < total ? <Link className="text-primary hover:underline" href={link(page + 1)}>{t("older")} →</Link> : <span />}
      </div>
    </>
  );
}
