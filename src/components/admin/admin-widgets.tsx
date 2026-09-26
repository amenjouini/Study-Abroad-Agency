"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  appointmentSettingsAction,
  convertLeadAction,
  permissionAction,
  removePlanItemAction,
  setActiveAction,
} from "@/app/admin/actions";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import type { PermissionState } from "@/server/admin";

export function ActiveToggle({ userId, active, disabled }: { userId: string; active: boolean; disabled?: boolean }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant={active ? "outline" : "success"} disabled={pending || disabled} onClick={() => run(() => setActiveAction(userId, !active), () => router.refresh())}>
        {active ? t("deactivate") : t("activate")}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export interface PermissionRow {
  key: string;
  area: string;
  description: string;
  state: PermissionState;
  fromRole: boolean;
}

/** Per-user permissions on top of the role: inherit, grant (assigned cases), grant for all cases, or revoke. */
export function PermissionEditor({ userId, rows, editable }: { userId: string; rows: PermissionRow[]; editable: boolean }) {
  const t = useTranslations("admin.staff");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  return (
    <div className="mt-3 space-y-1">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <label key={r.key} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
            <span>
              <span className="font-medium">{r.key}</span>
              <span className="block text-muted-foreground">{r.description}{r.fromRole ? ` · ${t("byRole")}` : ""}</span>
            </span>
            <Select
              className="h-8 w-36 text-xs"
              value={r.state}
              disabled={pending || !editable}
              onChange={(e) => run(() => permissionAction(userId, r.key, e.target.value as PermissionState), () => router.refresh())}
              aria-label={r.key}
            >
              <option value="inherit">{t("inherit")}</option>
              <option value="grant">{t("grant")}</option>
              <option value="grant_all">{t("grantAll")}</option>
              <option value="revoke">{t("revoke")}</option>
            </Select>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ConvertLeadButton({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const t = useTranslations("admin.leads");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="success" disabled={pending || disabled} onClick={() => window.confirm(t("confirmConvert")) && run(() => convertLeadAction(leadId), (d) => { setCreds(d); router.refresh(); })}>
        {t("convert")}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {creds ? (
        <Alert tone="warning" title={t("credsTitle")}>
          <p>{t("credsBody")}</p>
          <p className="mt-1 font-mono text-xs">{creds.email} / {creds.password}</p>
        </Alert>
      ) : null}
    </div>
  );
}

export function RemovePlanItem({ itemId }: { itemId: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(t("confirmTitle")) && run(() => removePlanItemAction(itemId), () => router.refresh())}>
      {t("remove")}
    </Button>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 0];

export function AppointmentSettingsForm({ initial }: { initial: { workingDays: number[]; startTime: string; endTime: string; slotMinutes: number; maxPerDay: number; blockedDates: string[]; minNoticeHours: number } }) {
  const t = useTranslations("admin.appointments");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [v, setV] = useState({ ...initial, blocked: initial.blockedDates.join("\n") });
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("workingDays")}</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <label key={d} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${v.workingDays.includes(d) ? "border-primary bg-accent text-primary" : "border-input bg-card"}`}>
              <input type="checkbox" className="sr-only" checked={v.workingDays.includes(d)} onChange={(e) => { setSaved(false); setV({ ...v, workingDays: e.target.checked ? [...v.workingDays, d] : v.workingDays.filter((x) => x !== d) }); }} />
              {t(`day${d}` as never)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("start")}><Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
        <Field label={t("end")}><Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
        <Field label={t("slotMinutes")}><Input type="number" min={10} value={v.slotMinutes} onChange={(e) => setV({ ...v, slotMinutes: Number(e.target.value) })} /></Field>
        <Field label={t("maxPerDay")}><Input type="number" min={1} value={v.maxPerDay} onChange={(e) => setV({ ...v, maxPerDay: Number(e.target.value) })} /></Field>
        <Field label={t("minNotice")}><Input type="number" min={0} value={v.minNoticeHours} onChange={(e) => setV({ ...v, minNoticeHours: Number(e.target.value) })} /></Field>
      </div>
      <Field label={t("blockedDates")} hint={t("blockedHint")}>
        <textarea className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" value={v.blocked} onChange={(e) => setV({ ...v, blocked: e.target.value })} />
      </Field>
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            run(
              () => appointmentSettingsAction({ workingDays: v.workingDays, startTime: v.startTime, endTime: v.endTime, slotMinutes: v.slotMinutes, maxPerDay: v.maxPerDay, minNoticeHours: v.minNoticeHours, blockedDates: v.blocked.split(/[\s,]+/).filter(Boolean) }),
              () => { setSaved(true); router.refresh(); },
            )
          }
        >
          {tc("save")}
        </Button>
        {saved ? <span className="text-sm text-success">{tc("saved")}</span> : null}
      </div>
    </div>
  );
}
