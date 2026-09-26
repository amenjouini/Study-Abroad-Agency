import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { formatDate, formatDateTime, localizeSubjectLabel, localized } from "@/lib/format";
import { formatMoney, money, toDecimalString } from "@/lib/money";
import { computePaymentStatus, summarizePayments } from "@/lib/payments";
import { todayISO } from "@/lib/dates";
import { caseAccessWhere, hasPermission } from "@/server/authz";
import { getCaseDocumentsView } from "@/server/documents-queries";
import { requireArea } from "@/server/session";
import { AppointmentButtons, ApplicationStaffForm, AssignForm, ConfirmRequiredForm, EurValueForm, NoteForm, PlannedSubmissionForm, ReevaluateButton, ResolveForm, ScholarshipStaffForm, SponsorStatusStaffForm, StageForm, TaskForm, TaskStatusButtons, TransactionForm, UniversitalyStaffForm, VisaForm } from "./forms";
import { AssignPlanButton } from "./assign-plan";

export const metadata: Metadata = { title: "Student" };

const TABS = ["overview", "documents", "applications", "funding", "payments", "review", "timeline"] as const;
type Tab = (typeof TABS)[number];

interface Snapshot {
  funding?: { required: { amountMinor: number; currency: string }; available: { amountMinor: number; currency: string }; shortfall: { amountMinor: number; currency: string }; surplus: { amountMinor: number; currency: string }; proposedRequired: { amountMinor: number; currency: string } | null; needsStaffConfirmation: boolean; contributions: Array<{ fundingSourceId: string; counted: boolean; amountEur: { amountMinor: number; currency: string } | null; reason?: string }> } | null;
  passport?: { satisfied: boolean | null; referenceDate: string | null; referenceSource: string | null; requiredValidUntilAfter: string | null; passportExpiry: string | null } | null;
  deadlines?: Record<string, { date: string | null; method: string; sourceName?: string | null; sourceUrl?: string | null }>;
}

export default async function StaffCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireArea("staff");
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const locale = await getLocale();
  const t = await getTranslations("staff.case");
  const te = await getTranslations("enums");
  const tc = await getTranslations("common");
  const rel = (c: string) => (te.has(`Relationship.${c}` as never) ? te(`Relationship.${c}` as never) : undefined);

  // Authorization: the case must be inside the actor's scope (assigned, or wider by grant, or admin).
  const scope = await caseAccessWhere(user, "students.read");
  const found = await db.case.findFirst({
    where: { AND: [{ id }, scope] },
    include: {
      student: { include: { user: { select: { email: true } }, desiredCity: true, degrees: true } },
      currentStage: true,
      procedureVersion: { include: { academicYear: true } },
      assignments: { where: { active: true }, include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!found) notFound();
  const c = found;

  const [stages, staffUsers, canAssign, canPay, canFund, canVisa, canWriteApps] = await Promise.all([
    db.caseStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { role: { key: { in: ["STAFF", "ADMIN", "OWNER"] } }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    hasPermission(user, "cases.assign", { caseId: id }),
    hasPermission(user, "payments.write", { caseId: id }),
    hasPermission(user, "funding.write", { caseId: id }),
    hasPermission(user, "visa.write", { caseId: id }),
    hasPermission(user, "applications.write", { caseId: id }),
  ]);
  const snap = (c.engineSnapshot ?? {}) as Snapshot;
  const s = c.student;
  const money2 = (m: { amountMinor: number; currency: string }) => formatMoney(money(m.amountMinor, m.currency), locale);

  const tabLink = (k: Tab) => (
    <Link key={k} href={`/staff/students/${id}?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${k === tab ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>
      {t(`tabs.${k}`)}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={`${s.firstName} ${s.lastName}`}
        description={`${c.caseNumber} · ${s.user.email}${s.phone ? ` · ${s.phone}` : ""}`}
        actions={
          <>
            {c.requiresHumanReview && c.humanReviewPriority ? <EnumBadge enumName="Priority" value={c.humanReviewPriority} /> : null}
            {c.requiresHumanReview ? <Badge tone="primary">{t("requiresHumanReview")}</Badge> : null}
          </>
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-2" aria-label="Case sections">
        {TABS.map(tabLink)}
      </nav>

      {tab === "overview" ? (
        <OverviewTab />
      ) : null}
      {tab === "documents" ? <DocumentsTab /> : null}
      {tab === "applications" ? <ApplicationsTab /> : null}
      {tab === "funding" ? <FundingTab /> : null}
      {tab === "payments" ? <PaymentsTab /> : null}
      {tab === "review" ? <ReviewTab /> : null}
      {tab === "timeline" ? <TimelineTab /> : null}
    </>
  );

  // ───────────────────────── Tabs ─────────────────────────
  async function OverviewTab() {
    const [apps, docs] = await Promise.all([
      db.universityApplication.findMany({ where: { caseId: id }, include: { university: true, program: true }, orderBy: { createdAt: "asc" } }),
      getCaseDocumentsView(user, id, locale),
    ]);
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{t("journey")}</CardTitle><span className="text-sm font-semibold tabular-nums">{c.currentStage.progressPercent}%</span></CardHeader>
            <CardBody className="space-y-4">
              <Progress value={c.currentStage.progressPercent} label={t("journey")} />
              <StageForm caseId={id} current={c.currentStage.key} stages={stages.map((x) => ({ key: x.key, name: localized(x.nameI18n, locale, x.name) }))} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t("procedure")}: {c.procedureVersion.academicYear.label} · v{c.procedureVersion.versionNumber}</span>
                <ReevaluateButton caseId={id} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("summary")}</CardTitle></CardHeader>
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase text-muted-foreground">{t("documents")}</dt><dd className="font-medium">{docs.approved} / {docs.total} {t("approved")}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{tc("city")}</dt><dd>{s.desiredCity?.name ?? "—"}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{t("passport")}</dt><dd>{s.passportNumber ?? "—"}{s.passportExpiry ? ` (${formatDate(s.passportExpiry, locale)})` : ""}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{t("language")}</dt><dd>{s.studyLanguage ? te(`TeachingLanguage.${s.studyLanguage}`) : "—"} {s.languageCertificate ? `· ${s.languageCertificate} ${s.languageCertificateLevel ?? ""}` : ""}</dd></div>
              </dl>
              <ul className="mt-4 divide-y divide-border rounded-md border border-border">
                {apps.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{a.university.name}<span className="block text-xs text-muted-foreground">{a.program.name}</span></span>
                    <EnumBadge enumName="ApplicationStatus" value={a.status} />
                  </li>
                ))}
                {apps.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">{t("noApplications")}</li> : null}
              </ul>
            </CardBody>
          </Card>
          {snap.passport ? (
            <Card>
              <CardHeader><CardTitle>{t("passportCheck")}</CardTitle>{snap.passport.satisfied === null ? <Badge>{tc("unknown")}</Badge> : snap.passport.satisfied ? <Badge tone="success">OK</Badge> : <Badge tone="danger">{t("fails")}</Badge>}</CardHeader>
              <CardBody className="space-y-3 text-sm">
                <p>{t("passportRule", { date: snap.passport.requiredValidUntilAfter ? formatDate(snap.passport.requiredValidUntilAfter, locale) : "—", ref: snap.passport.referenceDate ? formatDate(snap.passport.referenceDate, locale) : "—" })}</p>
                <p className="text-xs text-muted-foreground">{t("referenceSource")}: {snap.passport.referenceSource ?? "—"}</p>
                <PlannedSubmissionForm caseId={id} value={c.plannedSubmissionDate ? toISODate(c.plannedSubmissionDate) : ""} />
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>{t("assigned")}</CardTitle></CardHeader>
            <CardBody>
              {canAssign ? <AssignForm caseId={id} assigned={c.assignments.map((a) => ({ id: a.user.id, name: a.user.name }))} staff={staffUsers} /> : <p className="text-sm">{c.assignments.map((a) => a.user.name).join(", ") || "—"}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("keyDates")}</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-sm">
              {snap.deadlines ? Object.entries(snap.deadlines).map(([code, d]) => (
                <div key={code}>
                  <p className="text-xs uppercase text-muted-foreground">{code}</p>
                  <p>{d.date ? formatDate(d.date, locale) : "—"} <span className="text-xs text-muted-foreground">({d.method}{d.sourceName ? ` · ${d.sourceName}` : ""})</span></p>
                </div>
              )) : <p className="text-muted-foreground">—</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  async function DocumentsTab() {
    const docs = await getCaseDocumentsView(user, id, locale);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("docsProgress", { approved: docs.approved, total: docs.total })}</p>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 text-start text-xs uppercase text-muted-foreground"><th className="px-3 py-2 text-start">{t("requirement")}</th><th className="px-3 py-2 text-start">{t("subject")}</th><th className="px-3 py-2 text-start">{tc("status")}</th><th className="px-3 py-2 text-start">{tc("date")}</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {docs.cards.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2"><span className="font-medium">{d.name}</span>{!d.mandatory ? <Badge className="ms-2">{tc("optional")}</Badge> : null}{d.rejectionReason ? <span className="block text-xs text-danger">{d.rejectionReason}</span> : null}{d.blockedBy.length ? <span className="block text-xs text-warning">{t("blockedBy", { names: d.blockedBy.join(", ") })}</span> : null}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{te(`SubjectType.${d.subjectType}` as never)}{d.subjectLabel && d.subjectType !== "STUDENT" ? ` · ${localizeSubjectLabel(d.subjectLabel, rel)}` : ""}</td>
                  <td className="px-3 py-2"><EnumBadge enumName="RequirementStatus" value={d.status} /></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{d.deadline ? formatDate(d.deadline, locale) : "—"}</td>
                  <td className="px-3 py-2 text-end">{d.kind === "DOCUMENT" && d.versions.length ? <Link className="text-primary hover:underline" href={`/staff/documents?instance=${d.id}&scope=${["REJECTED", "NEEDS_CORRECTION"].includes(d.status) ? "rejected" : "pending"}`}>{t("open")} ({d.versions.length})</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  async function ApplicationsTab() {
    const [apps, programs, scholarshipApps] = await Promise.all([
      db.universityApplication.findMany({ where: { caseId: id }, include: { university: true, program: true, visa: true, universitaly: true }, orderBy: { createdAt: "asc" } }),
      db.universityProgram.findMany({ where: { active: true, academicYear: { isCurrent: true } }, include: { university: true }, orderBy: [{ university: { name: "asc" } }, { name: "asc" }] }),
      db.scholarshipApplication.findMany({ where: { caseId: id }, include: { scholarshipVersion: { include: { scholarship: true } } } }),
    ]);
    const programOptions = programs.map((p) => ({ id: p.id, label: `${p.university.name} — ${p.name}` }));
    return (
      <div className="space-y-5">
        {apps.length === 0 ? <EmptyState title={t("noApplications")} /> : null}
        {apps.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div><CardTitle>{a.university.name}</CardTitle><p className="mt-0.5 text-sm text-muted-foreground">{a.program.name} · {te(`TeachingLanguage.${a.program.language}`)}</p></div>
              <EnumBadge enumName="ApplicationStatus" value={a.status} />
            </CardHeader>
            <CardBody className="space-y-5">
              {canWriteApps ? <ApplicationStaffForm caseId={id} applicationId={a.id} programId={a.programId} initial={{ status: a.status, admissionResult: a.admissionResult ?? "", conditions: a.conditions ?? "", notes: a.notes ?? "" }} /> : null}
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-semibold">Universitaly</p>
                {canVisa ? (
                  <UniversitalyStaffForm applicationId={a.id} initial={{ contactEmail: a.universitaly?.contactEmail ?? "", referenceId: a.universitaly?.referenceId ?? "", status: a.universitaly?.status ?? "NOT_STARTED", validationStatus: a.universitaly?.validationStatus ?? "", correctionsRequested: a.universitaly?.correctionsRequested ?? "", transmittedToEmbassy: a.universitaly?.transmittedToEmbassy ?? false, submissionDate: a.universitaly?.submissionDate ? toISODate(a.universitaly.submissionDate) : "", transmittedAt: a.universitaly?.transmittedAt ? toISODate(a.universitaly.transmittedAt) : "", notes: a.universitaly?.notes ?? "" }} />
                ) : <p className="text-sm">{a.universitaly ? te(`UniversitalyStatus.${a.universitaly.status}`) : "—"}</p>}
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-semibold">{t("visa")}</p>
                {canVisa ? (
                  <VisaForm
                    applicationId={a.id}
                    programs={programOptions}
                    initial={{
                      exists: !!a.visa,
                      stage: a.visa?.stage ?? "DOCUMENT_PREPARATION",
                      appointmentAt: a.visa?.appointmentAt ? a.visa.appointmentAt.toISOString().slice(0, 16) : "",
                      submissionDate: a.visa?.submissionDate ? toISODate(a.visa.submissionDate) : "",
                      reference: a.visa?.reference ?? "",
                      decision: a.visa?.decision ?? "",
                      additionalRequests: a.visa?.additionalRequests ?? "",
                      arrivalDate: a.visa?.arrivalDate ? toISODate(a.visa.arrivalDate) : "",
                      notes: a.visa?.notes ?? "",
                      programId: a.visa?.programId ?? a.programId,
                      intendedProgramId: a.visa?.intendedEnrollmentProgramId ?? a.programId,
                    }}
                  />
                ) : <p className="text-sm">{a.visa ? te(`VisaStage.${a.visa.stage}`) : "—"}</p>}
              </div>
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>{t("scholarships")}</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {scholarshipApps.length === 0 ? <p className="text-sm text-muted-foreground">{t("noScholarships")}</p> : null}
            {scholarshipApps.map((sa) => (
              <div key={sa.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{sa.scholarshipVersion.scholarship.name}</p><EnumBadge enumName="ScholarshipApplicationStatus" value={sa.status} /></div>
                {sa.awardedAmountMinor != null && sa.awardedCurrency ? <p className="text-xs text-muted-foreground">{t("awarded")}: {money2({ amountMinor: sa.awardedAmountMinor, currency: sa.awardedCurrency })}</p> : null}
                {hasPermissionSync(canWriteApps) ? <ScholarshipStaffForm id={sa.id} status={sa.status} /> : null}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }

  async function FundingTab() {
    const [sponsors, sources] = await Promise.all([
      db.sponsor.findMany({ where: { caseId: id }, include: { relationship: true }, orderBy: { createdAt: "asc" } }),
      db.fundingSource.findMany({ where: { caseId: id }, include: { sponsor: { include: { relationship: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    const f = snap.funding;
    return (
      <div className="space-y-5">
        {f ? (
          <Card>
            <CardHeader><CardTitle>{t("fundingCalc")}</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs uppercase text-muted-foreground">{t("required")}</dt><dd className="text-lg font-semibold tabular-nums">{money2(f.required)}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{t("available")}</dt><dd className="text-lg font-semibold tabular-nums">{money2(f.available)}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{t("shortfall")}</dt><dd className={`text-lg font-semibold tabular-nums ${f.shortfall.amountMinor ? "text-danger" : "text-success"}`}>{money2(f.shortfall)}</dd></div>
                <div><dt className="text-xs uppercase text-muted-foreground">{t("surplus")}</dt><dd className="text-lg font-semibold tabular-nums">{money2(f.surplus)}</dd></div>
              </dl>
              {f.proposedRequired && canFund ? <ConfirmRequiredForm caseId={id} proposed={toDecimalString(money(f.proposedRequired.amountMinor, f.proposedRequired.currency))} confirmed={c.confirmedRequiredMinor != null ? toDecimalString(money(c.confirmedRequiredMinor, c.confirmedRequiredCurrency ?? "EUR")) : ""} /> : null}
              <p className="text-xs text-muted-foreground">{t("fundingNote")}</p>
            </CardBody>
          </Card>
        ) : <Alert tone="info">{t("noFundingCalc")}</Alert>}
        <Card>
          <CardHeader><CardTitle>{t("fundingSources")}</CardTitle></CardHeader>
          <ul className="divide-y divide-border">
            {sources.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{t("noFunding")}</li> : null}
            {sources.map((src) => {
              const contribution = f?.contributions.find((x) => x.fundingSourceId === src.id);
              return (
                <li key={src.id} className="px-4 py-3 text-sm sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{te(`FundingSourceType.${src.type}`)}{src.description ? ` — ${src.description}` : ""}</p>
                      <p className="tabular-nums text-muted-foreground">{money2({ amountMinor: src.amountMinor, currency: src.currency })}{src.currency !== "EUR" ? ` → ${src.eurValueMinor != null ? money2({ amountMinor: src.eurValueMinor, currency: "EUR" }) : t("noEurValue")}` : ""}</p>
                      {src.exchangeRate ? <p className="text-xs text-muted-foreground">{t("rate")}: {src.exchangeRate.toString()} · {src.exchangeRateDate ? formatDate(src.exchangeRateDate, locale) : ""}</p> : null}
                    </div>
                    {contribution ? (contribution.counted ? <Badge tone="success">{t("counted")}</Badge> : <Badge tone="danger">{t("notCounted")}: {contribution.reason}</Badge>) : null}
                  </div>
                  {src.currency !== "EUR" && canFund ? <EurValueForm fundingSourceId={src.id} initial={{ eurAmount: src.eurValueMinor != null ? toDecimalString(money(src.eurValueMinor, "EUR")) : "", exchangeRate: src.exchangeRate?.toString() ?? "", rateDate: src.exchangeRateDate ? toISODate(src.exchangeRateDate) : "" }} /> : null}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("sponsors")}</CardTitle></CardHeader>
          <ul className="divide-y divide-border">
            {sponsors.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{t("noSponsors")}</li> : null}
            {sponsors.map((sp2) => (
              <li key={sp2.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="font-medium">{sp2.fullName} <span className="font-normal text-muted-foreground">— {te(`Relationship.${sp2.relationship.code}` as never)}</span></p>
                <p className="text-xs text-muted-foreground">{sp2.professionalStatus ? te(`SponsorProfessionalStatus.${sp2.professionalStatus}`) : t("statusUnknown")}{sp2.pensionFund ? ` · ${sp2.pensionFund}` : ""}</p>
                {sp2.fundedByDescription ? <p className="text-xs">{sp2.fundedByDescription} — {sp2.sourceOfFunds}</p> : null}
                {canFund ? <SponsorStatusStaffForm caseId={id} sponsor={{ id: sp2.id, professionalStatus: sp2.professionalStatus ?? "", pensionFund: sp2.pensionFund ?? "", fundedByDescription: sp2.fundedByDescription ?? "", sourceOfFunds: sp2.sourceOfFunds ?? "" }} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  async function PaymentsTab() {
    const payments = await db.payment.findMany({ where: { caseId: id }, include: { transactions: { orderBy: { paidAt: "desc" } } }, orderBy: { sortOrder: "asc" } });
    const today = todayISO();
    const rows = payments.map((p) => {
      const paid = p.transactions.reduce((x, y) => x + y.amountMinor, 0);
      const due = p.dueDate ? toISODate(p.dueDate) : null;
      return { ...p, paid, due, shown: computePaymentStatus({ amountMinor: p.amountMinor, currency: p.currency, paidMinor: paid, dueDate: due, cancelled: p.status === "CANCELLED" }, today) };
    });
    const totals = summarizePayments(rows.map((r) => ({ amountMinor: r.amountMinor, currency: r.currency, paidMinor: r.paid, cancelled: r.status === "CANCELLED" })));
    if (rows.length === 0) {
      return <EmptyState title={t("noPayments")} action={canPay ? <AssignPlanButton caseId={id} /> : undefined} />;
    }
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {totals.map((x) => (
            <Card key={x.currency} className="p-4 sm:col-span-3"><div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs uppercase text-muted-foreground">{tc("total")}</p><p className="text-lg font-semibold tabular-nums">{formatMoney(x.total, locale)}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">{tc("paid")}</p><p className="text-lg font-semibold tabular-nums text-success">{formatMoney(x.paid, locale)}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">{tc("remaining")}</p><p className="text-lg font-semibold tabular-nums">{formatMoney(x.remaining, locale)}</p></div>
            </div></Card>
          ))}
        </div>
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{money2({ amountMinor: r.paid, currency: r.currency })} / {money2({ amountMinor: r.amountMinor, currency: r.currency })}{r.due ? ` · ${formatDate(r.due, locale)}` : ""}</p></div>
                  <EnumBadge enumName="PaymentStatus" value={r.shown} />
                </div>
                {r.transactions.map((x) => (
                  <p key={x.id} className="mt-1 text-xs text-muted-foreground">{formatDate(x.paidAt, locale)} · {money2({ amountMinor: x.amountMinor, currency: x.currency })} · {x.method}{x.reference ? ` · ${x.reference}` : ""}{x.receiptStorageKey ? <> · <a className="text-primary hover:underline" href={`/api/payments/receipt/${x.id}`} target="_blank" rel="noreferrer">{t("receipt")}</a></> : null}</p>
                ))}
                {canPay && r.paid < r.amountMinor && r.status !== "CANCELLED" ? <div className="mt-2"><TransactionForm paymentId={r.id} currency={r.currency} remaining={toDecimalString(money(r.amountMinor - r.paid, r.currency))} /></div> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  async function ReviewTab() {
    const [items, notes, tasks, appts] = await Promise.all([
      db.humanReviewItem.findMany({ where: { caseId: id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { message: true } }),
      db.note.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
      db.task.findMany({ where: { caseId: id }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: { include: { user: { select: { name: true } } } } } }),
      db.agencyAppointment.findMany({ where: { caseId: id }, orderBy: { startsAt: "desc" }, take: 10 }),
    ]);
    const authors = await db.user.findMany({ where: { id: { in: notes.map((n) => n.authorId) } }, select: { id: true, name: true } });
    const author = new Map(authors.map((a) => [a.id, a.name]));
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>{t("humanReview")}</CardTitle></CardHeader>
            <ul className="divide-y divide-border">
              {items.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{t("noReview")}</li> : null}
              {items.map((i) => (
                <li key={i.id} className="px-4 py-3 text-sm sm:px-5">
                  <div className="flex items-center justify-between gap-2"><p className="font-medium">{i.source === "STUDENT_HELP" ? t("helpRequest") : i.code}</p><div className="flex gap-1"><EnumBadge enumName="Priority" value={i.priority} /><EnumBadge enumName="HumanReviewStatus" value={i.status} /></div></div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{i.reason}</p>
                  {i.resolution ? <p className="mt-1 text-xs text-success">{t("resolution")}: {i.resolution}</p> : null}
                  {i.status !== "RESOLVED" ? <ResolveForm itemId={i.id} isHelp={i.source === "STUDENT_HELP"} /> : null}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("appointments")}</CardTitle></CardHeader>
            <ul className="divide-y divide-border">
              {appts.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{t("noAppointments")}</li> : null}
              {appts.map((a) => (
                <li key={a.id} className="space-y-2 px-4 py-3 text-sm sm:px-5">
                  <div className="flex items-center justify-between gap-2"><span>{formatDateTime(a.startsAt, locale)} — {a.reason}</span><EnumBadge enumName="AppointmentStatus" value={a.status} /></div>
                  <AppointmentButtons id={a.id} status={a.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>{t("tasks")}</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <ul className="divide-y divide-border rounded-md border border-border">
                {tasks.length === 0 ? <li className="p-3 text-sm text-muted-foreground">{t("noTasks")}</li> : null}
                {tasks.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{k.title}<span className="block text-xs text-muted-foreground">{k.assignee?.user.name ?? ""}{k.dueDate ? ` · ${formatDate(k.dueDate, locale)}` : ""}</span></span>
                    <span className="flex items-center gap-1"><EnumBadge enumName="TaskStatus" value={k.status} /><TaskStatusButtons id={k.id} status={k.status} /></span>
                  </li>
                ))}
              </ul>
              <TaskForm caseId={id} staff={staffUsers} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("notes")}</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <NoteForm caseId={id} />
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-md bg-muted/50 p-3 text-sm"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-muted-foreground">{author.get(n.authorId)} · {formatDateTime(n.createdAt, locale)}</p></li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  async function TimelineTab() {
    const [timeline, history] = await Promise.all([
      db.timelineEntry.findMany({ where: { caseId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.caseStageHistory.count({ where: { caseId: id } }),
    ]);
    return (
      <Card>
        <CardHeader><CardTitle>{t("timeline")}</CardTitle><span className="text-xs text-muted-foreground">{t("stageChanges", { n: history })}</span></CardHeader>
        <ol className="divide-y divide-border">
          {timeline.map((e) => (
            <li key={e.id} className="px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{e.title}</p>{!e.visibleToStudent ? <Badge>{tc("internal")}</Badge> : null}</div>
              {e.detail ? <p className="text-sm text-muted-foreground">{e.detail}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.createdAt, locale)}</p>
            </li>
          ))}
        </ol>
      </Card>
    );
  }
}

function hasPermissionSync(v: boolean) {
  return v;
}
