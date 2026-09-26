import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatDateTime, localizeSubjectLabel } from "@/lib/format";
import type { AuthUser } from "@/server/authz";
import { getReviewWorkspace } from "@/server/review-queries";
import { ReviewPanel } from "./review-panel";

/** Left: student info + queue. Center: preview. Right: review panel. Staff never leave the queue to review. */
export async function ReviewWorkspace({ user, area, searchParams }: { user: AuthUser; area: "staff" | "admin"; searchParams: { instance?: string; scope?: string } }) {
  const locale = await getLocale();
  const t = await getTranslations("staff.review");
  const te = await getTranslations("enums");
  const scope = searchParams.scope === "rejected" ? "rejected" : "pending";
  const ws = await getReviewWorkspace(user, locale, searchParams.instance, scope);
  const sel = ws.selected;
  const rel = (c: string) => (te.has(`Relationship.${c}` as never) ? te(`Relationship.${c}` as never) : undefined);
  const base = `/${area}/documents`;
  const selIdx = sel ? ws.items.findIndex((x) => x.id === sel.id) : -1;
  const nextId = sel ? (ws.items[selIdx + 1]?.id ?? ws.items[selIdx - 1]?.id ?? null) : null;
  const latest = sel?.versions.find((v) => v.status !== "SUPERSEDED") ?? sel?.versions[0];

  return (
    <>
      <PageHeader title={t("title")} description={t("count", { n: ws.items.length })} />
      <div className="mb-4 flex gap-2 text-sm">
        {(["pending", "rejected"] as const).map((s) => (
          <Link key={s} href={`${base}?scope=${s}`} className={`rounded-full border px-3 py-1 ${scope === s ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
            {t(`scope.${s}`)}
          </Link>
        ))}
      </div>
      {ws.items.length === 0 && !sel ? (
        <EmptyState title={t("emptyQueue")} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
          {/* Left: student + queue (a top row below 2xl) */}
          <div className="space-y-4 xl:col-span-2 2xl:col-span-1">
            {sel ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("student")}</CardTitle>
                </CardHeader>
                <CardBody className="space-y-1 text-sm">
                  <Link href={`/staff/students/${sel.caseId}`} className="font-medium text-primary hover:underline">{sel.student.name}</Link>
                  <p className="text-xs text-muted-foreground">{sel.student.caseNumber} · {sel.student.stage}</p>
                  <p>{sel.student.email}</p>
                  {sel.student.phone ? <p>{sel.student.phone}</p> : null}
                  {sel.student.passportNumber ? <p className="text-xs text-muted-foreground">{t("passport")}: {sel.student.passportNumber}</p> : null}
                  {sel.sponsor ? (
                    <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
                      <p className="font-medium">{sel.sponsor.name}</p>
                      <p>{te(`Relationship.${sel.sponsor.relationship}` as never)}{sel.sponsor.status ? ` · ${te(`SponsorProfessionalStatus.${sel.sponsor.status}` as never)}` : ""}{sel.sponsor.pensionFund ? ` · ${sel.sponsor.pensionFund}` : ""}</p>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>{t("queue")}</CardTitle>
              </CardHeader>
              <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                {ws.items.map((i) => (
                  <li key={i.id}>
                    <Link href={`${base}?instance=${i.id}&scope=${scope}`} className={`block px-4 py-2.5 text-sm hover:bg-muted/50 ${sel?.id === i.id ? "bg-accent" : ""}`}>
                      <span className="block font-medium">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">{i.student}{i.subject ? ` · ${localizeSubjectLabel(i.subject, rel)}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Center: preview */}
          <Card className="min-h-[32rem]">
            {sel && latest ? (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>{sel.name}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">{latest.filename} · v{latest.number} · {formatDateTime(latest.uploadedAt, locale)}</p>
                  </div>
                  <a href={`/api/documents/${latest.id}?download=1`} className="text-xs text-primary hover:underline">{t("download")}</a>
                </CardHeader>
                <div className="bg-muted/40 p-2">
                  {latest.mimeType === "application/pdf" ? (
                    <iframe title={sel.name} src={`/api/documents/${latest.id}`} className="h-[36rem] w-full rounded-md border border-border bg-white" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/documents/${latest.id}`} alt={sel.name} className="mx-auto max-h-[36rem] rounded-md border border-border bg-white object-contain" />
                  )}
                </div>
              </>
            ) : sel ? (
              <div className="p-6"><EmptyState title={t("noFile")} /></div>
            ) : (
              <div className="p-6"><EmptyState title={t("selectItem")} /></div>
            )}
          </Card>

          {/* Right: review panel */}
          <div className="space-y-4">
            {sel && latest ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("review")}</CardTitle>
                    <EnumBadge enumName="RequirementStatus" value={sel.status} />
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {sel.deadline ? <p className="text-xs text-muted-foreground">{t("deadline")}: {formatDate(sel.deadline, locale)}</p> : null}
                    {sel.blockedBy.length ? <Alert tone="warning">{t("blocked", { names: sel.blockedBy.join(", ") })}</Alert> : null}
                    <ReviewPanel
                      versionId={latest.id}
                      versionStatus={latest.status}
                      instanceId={sel.id}
                      requiredFormalities={sel.requiredFormalities}
                      current={latest.formalities}
                      nextHref={nextId ? `${base}?instance=${nextId}&scope=${scope}` : base}
                      canApprove={sel.blockedBy.length === 0}
                    />
                  </CardBody>
                </Card>
                {sel.source ? (
                  <Card>
                    <CardBody className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{t("source")}</p>
                      <a href={sel.source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{sel.source.name}</a>
                      {sel.source.verified ? <p>{t("verified", { date: formatDate(sel.source.verified, locale) })}</p> : null}
                      {sel.why ? <p className="mt-2">{sel.why}</p> : null}
                    </CardBody>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader>
                    <CardTitle>{t("history")}</CardTitle>
                  </CardHeader>
                  <ul className="divide-y divide-border">
                    {sel.versions.map((v) => (
                      <li key={v.id} className="px-4 py-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <a href={`/api/documents/${v.id}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">v{v.number} · {v.filename}</a>
                          <EnumBadge enumName="DocumentVersionStatus" value={v.status} />
                        </div>
                        <p className="text-muted-foreground">{formatDateTime(v.uploadedAt, locale)}</p>
                        {v.rejectionReason ? <p className="mt-1 text-danger">{v.rejectionReason}</p> : null}
                        {v.reviews.map((r) => (
                          <p key={r.id} className="mt-1 text-muted-foreground">
                            <span className="font-medium text-foreground">{r.by}</span> · {r.decision}{r.internal ? ` (${t("internal")})` : ""}{r.reason || r.comment ? ` — ${r.reason ?? r.comment}` : ""}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
