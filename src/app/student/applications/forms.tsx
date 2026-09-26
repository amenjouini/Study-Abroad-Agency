"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { addApplicationAction, addScholarshipAction, saveUniversitalyAction, setApplicationStatusAction, setScholarshipStatusAction } from "./actions";

export function AddApplicationForm({ programs }: { programs: Array<{ id: string; label: string }> }) {
  const t = useTranslations("student.applications");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [programId, setProgramId] = useState("");
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={t("chooseProgram")} htmlFor="program">
        <Select id="program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
          <option value="">—</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button disabled={pending || !programId} onClick={() => run(() => addApplicationAction(programId), () => { setProgramId(""); router.refresh(); })}>
        {t("add")}
      </Button>
    </div>
  );
}

export function ApplicationStatusButtons({ applicationId, programId, status }: { applicationId: string; programId: string; status: string }) {
  const t = useTranslations("student.applications");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const set = (s: string) => run(() => setApplicationStatusAction(applicationId, programId, s), () => router.refresh());
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {["PLANNED", "PREPARING"].includes(status) ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set(status === "PLANNED" ? "PREPARING" : "SUBMITTED")}>
          {status === "PLANNED" ? t("markPreparing") : t("markSubmitted")}
        </Button>
      ) : null}
      {!["REJECTED", "WITHDRAWN", "ENROLLED", "ACCEPTED"].includes(status) ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(t("confirmWithdraw")) && set("WITHDRAWN")}>
          {t("withdraw")}
        </Button>
      ) : null}
    </div>
  );
}

export function UniversitalyForm({ applicationId, contactEmail, referenceId }: { applicationId: string; contactEmail: string; referenceId: string }) {
  const t = useTranslations("student.applications");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [email, setEmail] = useState(contactEmail);
  const [ref, setRef] = useState(referenceId);
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("universitalyEmail")} htmlFor={`ue-${applicationId}`} hint={t("universitalyEmailHint")}>
          <Input id={`ue-${applicationId}`} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} />
        </Field>
        <Field label={t("universitalyRef")} htmlFor={`ur-${applicationId}`}>
          <Input id={`ur-${applicationId}`} value={ref} onChange={(e) => { setRef(e.target.value); setSaved(false); }} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={() => run(() => saveUniversitalyAction(applicationId, { contactEmail: email, referenceId: ref }), () => { setSaved(true); router.refresh(); })}>
          {tc("save")}
        </Button>
        {saved ? <span className="text-xs text-success">{tc("saved")}</span> : null}
      </div>
    </div>
  );
}

export function AddScholarshipButton({ versionId }: { versionId: string }) {
  const t = useTranslations("student.scholarships");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  return (
    <div>
      {error ? <p className="mb-1 text-xs text-danger">{error}</p> : null}
      <Button size="sm" disabled={pending} onClick={() => run(() => addScholarshipAction(versionId), () => router.refresh())}>
        {t("track")}
      </Button>
    </div>
  );
}

export function ScholarshipStatusButtons({ id, status }: { id: string; status: string }) {
  const t = useTranslations("student.scholarships");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const set = (s: string) => run(() => setScholarshipStatusAction(id, s), () => router.refresh());
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {status === "PLANNED" ? <Button size="sm" variant="outline" disabled={pending} onClick={() => set("PREPARING")}>{t("markPreparing")}</Button> : null}
      {["PLANNED", "PREPARING"].includes(status) ? <Button size="sm" variant="outline" disabled={pending} onClick={() => set("SUBMITTED")}>{t("markSubmitted")}</Button> : null}
      {!["AWARDED", "REJECTED", "WITHDRAWN"].includes(status) ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(t("confirmWithdraw")) && set("WITHDRAWN")}>{t("withdraw")}</Button> : null}
    </div>
  );
}
