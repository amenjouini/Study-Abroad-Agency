import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { articleAction } from "@/app/admin/actions";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function AdminKnowledgeBase() {
  const user = await requireArea("admin");
  await requirePermission(user, "knowledge_base.manage");
  const t = await getTranslations("admin.kb");
  const [articles, years] = await Promise.all([
    db.knowledgeBaseArticle.findMany({ include: { academicYear: true }, orderBy: { updatedAt: "desc" } }),
    db.academicYear.findMany({ orderBy: { startYear: "desc" } }),
  ]);
  const fields: FieldConfig[] = [
    { name: "title", label: t("titleField"), type: "text", required: true, wide: true },
    { name: "content", label: t("content"), type: "textarea", required: true },
    { name: "language", label: t("language"), type: "select", required: true, options: ["fr", "en", "ar", "it"].map((v) => ({ value: v, label: v })) },
    { name: "category", label: t("category"), type: "text", required: true },
    { name: "academicYearId", label: t("year"), type: "select", options: years.map((y) => ({ value: y.id, label: y.label })) },
    { name: "source", label: t("source"), type: "text" },
    { name: "officialUrl", label: t("url"), type: "text" },
    { name: "lastVerified", label: t("verified"), type: "date" },
    { name: "published", label: t("published"), type: "checkbox" },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <details className="mb-5 rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">{t("add")}</summary>
        <div className="border-t border-border p-4">
          <ConfigForm action={articleAction.bind(null, undefined)} fields={fields} resetOnSuccess initial={{ title: "", content: "", language: "fr", category: "", academicYearId: "", source: "", officialUrl: "", lastVerified: "", published: false }} />
        </div>
      </details>
      <div className="space-y-3">
        {articles.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div>
                <CardTitle>{a.title}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.category} · {a.language}{a.academicYear ? ` · ${a.academicYear.label}` : ""}</p>
              </div>
              {a.published ? <Badge tone="success">{t("publishedBadge")}</Badge> : <Badge>{t("draft")}</Badge>}
            </CardHeader>
            <CardBody>
              <details>
                <summary className="cursor-pointer text-sm text-primary">{t("edit")}</summary>
                <div className="mt-4">
                  <ConfigForm action={articleAction.bind(null, a.id)} fields={fields} initial={{ title: a.title, content: a.content, language: a.language, category: a.category, academicYearId: a.academicYearId ?? "", source: a.source ?? "", officialUrl: a.officialUrl ?? "", lastVerified: a.lastVerified ? toISODate(a.lastVerified) : "", published: a.published }} />
                </div>
              </details>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
