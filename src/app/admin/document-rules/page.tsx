import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Document rules" };

export default async function AdminDocumentRules({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "document_rules.manage");
  const t = await getTranslations("admin.rules");
  const sp = await searchParams;
  const versions = await db.procedureVersion.findMany({ include: { academicYear: true }, orderBy: [{ status: "asc" }, { academicYear: { startYear: "desc" } }] });
  const current = versions.find((v) => v.id === sp.version) ?? versions.find((v) => v.status === "ACTIVE") ?? versions[0];
  const reqs = current ? await db.procedureRequirement.findMany({ where: { procedureVersionId: current.id }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { dependsOn: true } }, ruleGroup: { include: { _count: { select: { conditions: true, children: true } } } } } }) : [];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {versions.map((v) => (
          <Link key={v.id} href={`/admin/document-rules?version=${v.id}`} className={`rounded-full border px-3 py-1 ${v.id === current?.id ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>{v.academicYear.label} · v{v.versionNumber} · {v.status}</Link>
        ))}
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {reqs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <Link href={`/admin/document-rules/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>
                <span className="block font-mono text-xs text-muted-foreground">{r.code} · {r.subjectType} · {r.kind}</span>
              </span>
              <span className="flex gap-1">
                <Badge>{r.ruleGroup ? t("conditions", { n: r.ruleGroup._count.conditions }) : t("always")}</Badge>
                {r._count.dependsOn ? <Badge tone="info">{t("dependsOn", { n: r._count.dependsOn })}</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
