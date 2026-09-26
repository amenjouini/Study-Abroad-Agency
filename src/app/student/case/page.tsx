import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDateTime, localized } from "@/lib/format";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "My case" };

export default async function StudentCase() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.case");
  const caseId = await ownCaseId(user);
  const [c, stages, timeline] = await Promise.all([
    db.case.findUniqueOrThrow({ where: { id: caseId }, include: { currentStage: true } }),
    db.caseStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    // Students only ever see the entries meant for them; internal entries stay staff-only.
    db.timelineEntry.findMany({ where: { caseId, visibleToStudent: true }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={`${t("caseNumber")}: ${c.caseNumber}`} />
      <Card>
        <CardBody>
          <Progress value={c.currentStage.progressPercent} label={t("journey")} />
          <ol className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
            {stages.map((s) => {
              const done = s.sortOrder < c.currentStage.sortOrder;
              const current = s.id === c.currentStageId;
              return (
                <li key={s.id} className={`flex items-center gap-2 ${current ? "font-semibold text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${current ? "border-primary bg-primary text-primary-foreground" : done ? "border-success bg-success-soft text-success" : "border-border"}`}>{done ? "✓" : ""}</span>
                  {localized(s.nameI18n, locale, s.name)}
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("timeline")}</CardTitle>
        </CardHeader>
        {timeline.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("emptyTimeline")} />
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {timeline.map((e) => (
              <li key={e.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm font-medium">{e.title}</p>
                {e.detail ? <p className="text-sm text-muted-foreground">{e.detail}</p> : null}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.createdAt, locale)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
