"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  appointmentAction,
  applicationAction,
  assignAction,
  confirmRequiredAction,
  eurValueAction,
  noteAction,
  plannedSubmissionAction,
  reevaluateAction,
  resolveReviewAction,
  scholarshipAction,
  sponsorStatusAction,
  stageAction,
  taskAction,
  taskStatusAction,
  universitalyAction,
  visaAction,
} from "@/app/staff/actions";
import { useActionRunner } from "@/components/forms";
import { usePostForm } from "@/components/post-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";

function useRefresh() {
  const router = useRouter();
  const r = useActionRunner();
  return { ...r, refresh: () => router.refresh() };
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-xs text-danger">{error}</p> : null;
}

export function StageForm({ caseId, current, stages }: { caseId: string; current: string; stages: Array<{ key: string; name: string }> }) {
  const t = useTranslations("staff.case");
  const { run, pending, error, refresh } = useRefresh();
  const [value, setValue] = useState(current);
  return (
    <div className="flex items-end gap-2">
      <Field label={t("stage")} className="min-w-52">
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </Select>
      </Field>
      <Button size="sm" disabled={pending || value === current} onClick={() => run(() => stageAction(caseId, value), refresh)}>{t("changeStage")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function AssignForm({ caseId, assigned, staff }: { caseId: string; assigned: Array<{ id: string; name: string }>; staff: Array<{ id: string; name: string }> }) {
  const t = useTranslations("staff.case");
  const { run, pending, error, refresh } = useRefresh();
  const [pick, setPick] = useState("");
  const candidates = staff.filter((s) => !assigned.some((a) => a.id === s.id));
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {assigned.map((a) => (
          <li key={a.id} className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
            {a.name}
            <button type="button" aria-label={t("unassign")} className="text-muted-foreground hover:text-danger" disabled={pending} onClick={() => run(() => assignAction(caseId, a.id, false), refresh)}>×</button>
          </li>
        ))}
        {assigned.length === 0 ? <li className="text-xs text-muted-foreground">{t("nobodyAssigned")}</li> : null}
      </ul>
      {candidates.length ? (
        <div className="flex items-center gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 max-w-56 text-xs">
            <option value="">{t("assignTo")}</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Button size="sm" variant="outline" disabled={pending || !pick} onClick={() => run(() => assignAction(caseId, pick, true), () => { setPick(""); refresh(); })}>{t("assign")}</Button>
        </div>
      ) : null}
      <ErrorLine error={error} />
    </div>
  );
}

export function NoteForm({ caseId }: { caseId: string }) {
  const t = useTranslations("staff.case");
  const { run, pending, error, refresh } = useRefresh();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2">
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("notePlaceholder")} aria-label={t("notePlaceholder")} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("internalNote")}</span>
        <Button size="sm" disabled={pending || !body.trim()} onClick={() => run(() => noteAction(caseId, body), () => { setBody(""); refresh(); })}>{t("addNote")}</Button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function TaskForm({ caseId, staff }: { caseId: string; staff: Array<{ id: string; name: string }> }) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const { run, pending, error, refresh } = useRefresh();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [assignee, setAssignee] = useState("");
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("taskTitle")} aria-label={t("taskTitle")} />
      <div className="grid grid-cols-3 gap-2">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("dueDate")} />
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label={t("priority")}>
          {["NORMAL", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{te(`Priority.${p}` as never)}</option>)}
        </Select>
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t("assignee")}>
          <option value="">{t("me")}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <Button size="sm" disabled={pending || title.trim().length < 2} onClick={() => run(() => taskAction(caseId, { title, dueDate: due, priority, assigneeUserId: assignee || undefined }), () => { setTitle(""); setDue(""); refresh(); })}>{t("addTask")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function TaskStatusButtons({ id, status }: { id: string; status: string }) {
  const t = useTranslations("staff.case");
  const { run, pending, refresh } = useRefresh();
  return (
    <div className="flex gap-1">
      {status !== "DONE" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskStatusAction(id, "DONE"), refresh)}>{t("markDone")}</Button> : null}
      {status === "OPEN" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskStatusAction(id, "IN_PROGRESS"), refresh)}>{t("start")}</Button> : null}
      {status !== "CANCELLED" && status !== "DONE" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => taskStatusAction(id, "CANCELLED"), refresh)}>{t("cancelTask")}</Button> : null}
    </div>
  );
}

export function ResolveForm({ itemId, isHelp }: { itemId: string; isHelp: boolean }) {
  const t = useTranslations("staff.case");
  const { run, pending, error, refresh } = useRefresh();
  const [text, setText] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={isHelp ? t("resolveHelpPlaceholder") : t("resolvePlaceholder")} aria-label={t("resolution")} />
      <Button size="sm" variant="success" disabled={pending || !text.trim()} onClick={() => run(() => resolveReviewAction(itemId, text), () => { setText(""); refresh(); })}>{t("resolve")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

const VISA_STAGE_KEYS = ["DOCUMENT_PREPARATION", "DOCUMENT_REVIEW", "FILE_COMPLETE", "UNIVERSITALY_VALIDATED", "APPOINTMENT_PENDING", "APPOINTMENT_SCHEDULED", "SUBMITTED", "PROCESSING", "ADDITIONAL_DOCUMENTS", "APPROVED", "REFUSED", "PASSPORT_RETURNED"];

export function VisaForm({
  applicationId,
  initial,
  programs,
}: {
  applicationId: string;
  initial: { stage: string; appointmentAt: string; submissionDate: string; reference: string; decision: string; additionalRequests: string; arrivalDate: string; notes: string; programId: string; intendedProgramId: string; exists: boolean };
  programs: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(initial);
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const mismatch = v.intendedProgramId !== v.programId;
  return (
    <div className="space-y-3">
      <ErrorLine error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("visaStage")}>
          <Select value={v.stage} onChange={set("stage")}>{VISA_STAGE_KEYS.map((s) => <option key={s} value={s}>{te(`VisaStage.${s}` as never)}</option>)}</Select>
        </Field>
        <Field label={t("appointmentAt")} hint={t("appointmentHint")}><Input type="datetime-local" value={v.appointmentAt} onChange={set("appointmentAt")} /></Field>
        <Field label={t("submissionDate")}><Input type="date" value={v.submissionDate} onChange={set("submissionDate")} /></Field>
        <Field label={t("arrivalDate")} hint={t("arrivalHint")}><Input type="date" value={v.arrivalDate} onChange={set("arrivalDate")} /></Field>
        <Field label={t("reference")}><Input value={v.reference} onChange={set("reference")} /></Field>
        <Field label={t("decision")}><Input value={v.decision} onChange={set("decision")} /></Field>
        <Field label={t("visaProgram")} hint={t("visaProgramHint")}>
          <Select value={v.programId} onChange={set("programId")}>{programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        </Field>
        <Field label={t("intendedProgram")}>
          <Select value={v.intendedProgramId} onChange={set("intendedProgramId")}>{programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        </Field>
      </div>
      {mismatch ? <Alert tone="danger" title={t("mismatchTitle")}>{t("mismatchBody")}</Alert> : null}
      <Field label={t("additionalRequests")}><Textarea rows={2} value={v.additionalRequests} onChange={set("additionalRequests")} /></Field>
      <Field label={tc("notes")}><Textarea rows={2} value={v.notes} onChange={set("notes")} /></Field>
      <p className="text-xs text-muted-foreground">{t("noChangeAppointment")}</p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              visaAction(applicationId, {
                stage: v.stage,
                appointmentAt: v.appointmentAt ? new Date(v.appointmentAt).toISOString() : undefined,
                submissionDate: v.submissionDate,
                arrivalDate: v.arrivalDate,
                reference: v.reference || undefined,
                decision: v.decision || undefined,
                additionalRequests: v.additionalRequests || undefined,
                notes: v.notes || undefined,
                programId: v.programId,
                intendedEnrollmentProgramId: v.intendedProgramId,
              }),
            refresh,
          )
        }
      >
        {initial.exists ? tc("save") : t("openVisaCase")}
      </Button>
    </div>
  );
}

export function UniversitalyStaffForm({ applicationId, initial }: { applicationId: string; initial: { contactEmail: string; referenceId: string; status: string; validationStatus: string; correctionsRequested: string; transmittedToEmbassy: boolean; submissionDate: string; transmittedAt: string; notes: string } }) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(initial);
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <ErrorLine error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("contactEmail")}><Input type="email" value={v.contactEmail} onChange={set("contactEmail")} /></Field>
        <Field label={t("referenceId")}><Input value={v.referenceId} onChange={set("referenceId")} /></Field>
        <Field label={tc("status")}>
          <Select value={v.status} onChange={set("status")}>{["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "CORRECTIONS_REQUESTED", "VALIDATED", "TRANSMITTED_TO_EMBASSY"].map((s) => <option key={s} value={s}>{te(`UniversitalyStatus.${s}` as never)}</option>)}</Select>
        </Field>
        <Field label={t("validationStatus")}><Input value={v.validationStatus} onChange={set("validationStatus")} /></Field>
        <Field label={t("submissionDate")}><Input type="date" value={v.submissionDate} onChange={set("submissionDate")} /></Field>
        <Field label={t("transmittedAt")}><Input type="date" value={v.transmittedAt} onChange={set("transmittedAt")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.transmittedToEmbassy} onChange={(e) => setV({ ...v, transmittedToEmbassy: e.target.checked })} className="accent-[var(--primary)]" />{t("transmitted")}</label>
      <Field label={t("correctionsRequested")}><Textarea rows={2} value={v.correctionsRequested} onChange={set("correctionsRequested")} /></Field>
      <Button size="sm" disabled={pending} onClick={() => run(() => universitalyAction(applicationId, { ...v, submissionDate: v.submissionDate, transmittedAt: v.transmittedAt, status: v.status }), refresh)}>{tc("save")}</Button>
    </div>
  );
}

export function ApplicationStaffForm({ caseId, applicationId, programId, initial }: { caseId: string; applicationId: string; programId: string; initial: { status: string; admissionResult: string; conditions: string; notes: string } }) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(initial);
  const set = (k: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <ErrorLine error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tc("status")}>
          <Select value={v.status} onChange={set("status")}>{["PLANNED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION", "ADDITIONAL_DOCUMENTS", "ACCEPTED", "REJECTED", "WITHDRAWN", "ENROLLED"].map((s) => <option key={s} value={s}>{te(`ApplicationStatus.${s}` as never)}</option>)}</Select>
        </Field>
        <Field label={t("admissionResult")}><Input value={v.admissionResult} onChange={set("admissionResult")} /></Field>
      </div>
      <Field label={t("conditions")}><Input value={v.conditions} onChange={set("conditions")} /></Field>
      <Field label={tc("notes")}><Input value={v.notes} onChange={set("notes")} /></Field>
      <Button size="sm" disabled={pending} onClick={() => run(() => applicationAction(caseId, applicationId, { programId, status: v.status, admissionResult: v.admissionResult, conditions: v.conditions, notes: v.notes }), refresh)}>{tc("save")}</Button>
    </div>
  );
}

export function EurValueForm({ fundingSourceId, initial }: { fundingSourceId: string; initial: { eurAmount: string; exchangeRate: string; rateDate: string } }) {
  const t = useTranslations("staff.case");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(initial);
  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{t("eurValueHint")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input inputMode="decimal" value={v.eurAmount} onChange={(e) => setV({ ...v, eurAmount: e.target.value })} placeholder="EUR" aria-label={t("eurAmount")} />
        <Input inputMode="decimal" value={v.exchangeRate} onChange={(e) => setV({ ...v, exchangeRate: e.target.value })} placeholder={t("rate")} aria-label={t("rate")} />
        <Input type="date" value={v.rateDate} onChange={(e) => setV({ ...v, rateDate: e.target.value })} aria-label={t("rateDate")} />
      </div>
      <Button size="sm" disabled={pending || !v.eurAmount || !v.exchangeRate || !v.rateDate} onClick={() => run(() => eurValueAction({ fundingSourceId, ...v }), refresh)}>{tc("save")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function ConfirmRequiredForm({ caseId, proposed, confirmed }: { caseId: string; proposed: string; confirmed: string }) {
  const t = useTranslations("staff.case");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(confirmed || proposed);
  return (
    <Alert tone="warning" title={t("reducedTitle")}>
      <p>{t("reducedBody", { proposed })}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input className="h-8 w-40" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label={t("confirmedAmount")} />
        <Button size="sm" disabled={pending || !v} onClick={() => run(() => confirmRequiredAction(caseId, v), refresh)}>{t("confirmAmount")}</Button>
        {confirmed ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => confirmRequiredAction(caseId, null), refresh)}>{t("clearConfirmation")}</Button> : null}
      </div>
      <ErrorLine error={error} />
    </Alert>
  );
}

export function PlannedSubmissionForm({ caseId, value }: { caseId: string; value: string }) {
  const t = useTranslations("staff.case");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(value);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t("plannedSubmission")} hint={t("plannedSubmissionHint")}><Input type="date" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Button size="sm" disabled={pending} onClick={() => run(() => plannedSubmissionAction(caseId, v || null), refresh)}>{tc("save")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function SponsorStatusStaffForm({ caseId, sponsor }: { caseId: string; sponsor: { id: string; professionalStatus: string; pensionFund: string; fundedByDescription: string; sourceOfFunds: string } }) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [v, setV] = useState(sponsor);
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <Select value={v.professionalStatus} onChange={(e) => setV({ ...v, professionalStatus: e.target.value })} aria-label={t("professionalStatus")}>
        <option value="">—</option>
        {["EMPLOYEE", "RETIRED", "BUSINESS_OWNER", "PROFESSIONAL", "UNEMPLOYED_NO_INCOME", "OTHER"].map((s) => <option key={s} value={s}>{te(`SponsorProfessionalStatus.${s}` as never)}</option>)}
      </Select>
      {v.professionalStatus === "RETIRED" ? (
        <Select value={v.pensionFund} onChange={(e) => setV({ ...v, pensionFund: e.target.value })} aria-label={t("pensionFund")}>
          <option value="">—</option>
          {["CNSS", "CNRPS", "OTHER"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      ) : <span />}
      <Button size="sm" disabled={pending || !v.professionalStatus} onClick={() => run(() => sponsorStatusAction(caseId, { sponsorId: sponsor.id, professionalStatus: v.professionalStatus, pensionFund: v.pensionFund || undefined, fundedByDescription: v.fundedByDescription || undefined, sourceOfFunds: v.sourceOfFunds || undefined }), refresh)}>{tc("save")}</Button>
      <div className="sm:col-span-3"><ErrorLine error={error} /></div>
    </div>
  );
}

export function TransactionForm({ paymentId, currency, remaining }: { paymentId: string; currency: string; remaining: string }) {
  const t = useTranslations("staff.case");
  const [open, setOpen] = useState(false);
  const { submit, pending, error } = usePostForm("/api/payments/transaction", () => setOpen(false));
  const today = new Date().toISOString().slice(0, 10);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("recordPayment")}</Button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget, { paymentId, currency }); }} className="mt-2 space-y-2 rounded-md bg-muted/50 p-3">
      <ErrorLine error={error} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Input name="amount" inputMode="decimal" required placeholder={`${t("amount")} (${currency})`} defaultValue={remaining} aria-label={t("amount")} />
        <Input name="paidAt" type="date" required defaultValue={today} aria-label={t("paidAt")} />
        <Select name="method" aria-label={t("method")}>{["Cash", "Bank transfer", "Card", "Cheque", "Other"].map((m) => <option key={m}>{m}</option>)}</Select>
        <Input name="reference" placeholder={t("reference")} aria-label={t("reference")} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="notes" placeholder={t("notes")} aria-label={t("notes")} />
        <input name="receipt" type="file" accept=".pdf,.jpg,.jpeg,.png" aria-label={t("receipt")} className="text-sm" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{t("recordPayment")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>×</Button>
      </div>
    </form>
  );
}

export function ScholarshipStaffForm({ id, status }: { id: string; status: string }) {
  const t = useTranslations("staff.case");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { run, pending, error, refresh } = useRefresh();
  const [s, setS] = useState(status);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <Select value={s} onChange={(e) => setS(e.target.value)} className="w-52" aria-label={tc("status")}>
        {["PLANNED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION", "AWARDED", "REJECTED", "WITHDRAWN"].map((x) => <option key={x} value={x}>{te(`ScholarshipApplicationStatus.${x}` as never)}</option>)}
      </Select>
      {s === "AWARDED" ? (
        <>
          <Input className="w-32" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("awardedAmount")} aria-label={t("awardedAmount")} />
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24"><option>EUR</option><option>TND</option></Select>
        </>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => run(() => scholarshipAction(id, { status: s, awardedAmount: amount || undefined, awardedCurrency: currency }), refresh)}>{tc("save")}</Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function ReevaluateButton({ caseId }: { caseId: string }) {
  const t = useTranslations("staff.case");
  const { run, pending, refresh } = useRefresh();
  return <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reevaluateAction(caseId), refresh)}>{t("reevaluate")}</Button>;
}

export function AppointmentButtons({ id, status }: { id: string; status: string }) {
  const t = useTranslations("staff.appointments");
  const { run, pending, error, refresh } = useRefresh();
  const [resched, setResched] = useState("");
  const btn = (label: string, to: string, variant: "success" | "outline" | "ghost" | "danger" = "outline") => (
    <Button size="sm" variant={variant} disabled={pending} onClick={() => run(() => appointmentAction(id, to), refresh)}>{label}</Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "REQUESTED" || status === "RESCHEDULED" ? btn(t("confirm"), "CONFIRMED", "success") : null}
      {status === "CONFIRMED" ? btn(t("complete"), "COMPLETED", "success") : null}
      {status === "CONFIRMED" ? btn(t("noShow"), "NO_SHOW") : null}
      {["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(status) ? btn(t("cancel"), "CANCELLED", "ghost") : null}
      {["REQUESTED", "CONFIRMED"].includes(status) ? (
        <span className="flex items-center gap-1">
          <Input type="datetime-local" value={resched} onChange={(e) => setResched(e.target.value)} className="h-8 w-48 text-xs" aria-label={t("newTime")} />
          <Button size="sm" variant="outline" disabled={pending || !resched} onClick={() => run(() => appointmentAction(id, "RESCHEDULED", new Date(resched).toISOString()), refresh)}>{t("reschedule")}</Button>
        </span>
      ) : null}
      <ErrorLine error={error} />
    </div>
  );
}
