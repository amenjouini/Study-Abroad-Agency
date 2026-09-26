import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardBody, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { localizeSubjectLabel } from "@/lib/format";
import { getCaseDocumentsView } from "@/server/documents-queries";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";
import { DocumentCardView } from "./document-card";

export const metadata: Metadata = { title: "Documents" };

const FILTERS = ["all", "todo", "review", "approved", "attention"] as const;
type Filter = (typeof FILTERS)[number];

export default async function StudentDocumentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.documents");
  const te = await getTranslations("enums");
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as Filter) : "all";

  const view = await getCaseDocumentsView(user, await ownCaseId(user), locale);
  const matches = (status: string) =>
    filter === "all" ||
    (filter === "todo" && ["NOT_STARTED", "REQUESTED"].includes(status)) ||
    (filter === "review" && ["UPLOADED", "UNDER_REVIEW", "REQUIRES_HUMAN_REVIEW"].includes(status)) ||
    (filter === "approved" && status === "APPROVED") ||
    (filter === "attention" && ["REJECTED", "NEEDS_CORRECTION", "EXPIRED"].includes(status));
  const cards = view.cards.filter((c) => matches(c.status));
  const groups = new Map<string, typeof cards>();
  for (const c of cards) {
    const key = c.subjectType === "STUDENT" ? "STUDENT" : `${c.subjectType}:${c.subjectLabel}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("progress", { approved: view.approved, total: view.total })} />
      <Progress value={view.total ? (view.approved / view.total) * 100 : 0} className="mb-4" label={t("title")} />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/student/documents" : `/student/documents?filter=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${f === filter ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
          >
            {t(`filters.${f}`)}
          </Link>
        ))}
      </div>
      {view.total === 0 && view.cards.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} action={<Link href="/student/onboarding" className="text-sm font-medium text-primary hover:underline">{t("startOnboarding")}</Link>} />
      ) : cards.length === 0 ? (
        <EmptyState title={t("nothingHere")} />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, list]) => {
            const [type, label] = key.split(":");
            return (
              <section key={key}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {te(`SubjectType.${type}` as never)}
                  {label ? ` — ${localizeSubjectLabel(label, (c) => (te.has(`Relationship.${c}` as never) ? te(`Relationship.${c}` as never) : undefined))}` : ""}
                </h2>
                <div className="space-y-3">
                  {list.map((c) => (
                    <DocumentCardView key={c.id} card={c} maxMb={view.maxMb} locale={locale} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Card className="mt-8">
        <CardBody className="text-xs text-muted-foreground">{t("generalNote")}</CardBody>
      </Card>
    </>
  );
}
