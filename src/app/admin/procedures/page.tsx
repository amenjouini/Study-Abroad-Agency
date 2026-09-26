import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VersionActions } from "@/components/admin/procedure-widgets";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Procedures" };

const TONE = { ACTIVE: "success", DRAFT: "warning", ARCHIVED: "neutral" } as const;

export default async function AdminProcedures() {
  const user = await requireArea("admin");
  await requirePermission(user, "procedures.manage");
  const t = await getTranslations("admin.procedures");
  const [procedures, years] = await Promise.all([
    db.procedure.findMany({
      include: {
        originCountry: true,
        destinationCountry: true,
        versions: { include: { academicYear: true, _count: { select: { requirements: true, deadlines: true, cases: true } } }, orderBy: [{ academicYear: { startYear: "desc" } }, { versionNumber: "desc" }] },
      },
    }),
    db.academicYear.findMany({ orderBy: { startYear: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6">
        {procedures.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div>
                <CardTitle>{p.name}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.originCountry.name} → {p.destinationCountry.name}</p>
              </div>
            </CardHeader>
            <ul className="divide-y divide-border">
              {p.versions.map((v) => (
                <li key={v.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/admin/procedures/${v.id}`} className="font-medium text-primary hover:underline">{v.academicYear.label} · v{v.versionNumber}</Link>
                      <p className="text-xs text-muted-foreground">{t("counts", { requirements: v._count.requirements, deadlines: v._count.deadlines, cases: v._count.cases })}{v.activatedAt ? ` · ${t("activatedOn", { date: formatDate(v.activatedAt, "en") })}` : ""}</p>
                    </div>
                    <Badge tone={TONE[v.status]}>{v.status}</Badge>
                  </div>
                  {v.notes ? <p className="text-xs text-muted-foreground">{v.notes}</p> : null}
                  <VersionActions versionId={v.id} status={v.status} years={years.map((y) => ({ id: y.id, label: y.label }))} />
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-border text-xs text-muted-foreground">{t("versionNote")}</CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
