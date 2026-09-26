"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDependencyAction, cloneAction, migrateAction, previewMigrationAction, removeDependencyAction, statusAction } from "@/app/admin/procedures/actions";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import type { MigrationDiff } from "@/server/procedures";

export function VersionActions({ versionId, status, years }: { versionId: string; status: string; years: Array<{ id: string; label: string }> }) {
  const t = useTranslations("admin.procedures");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [year, setYear] = useState(years[0]?.id ?? "");
  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {status !== "ACTIVE" && status !== "ARCHIVED" ? <Button size="sm" variant="success" disabled={pending} onClick={() => window.confirm(t("confirmActivate")) && run(() => statusAction(versionId, "ACTIVE"), () => router.refresh())}>{t("activate")}</Button> : null}
        {status === "ACTIVE" ? <Button size="sm" variant="outline" disabled={pending} onClick={() => window.confirm(t("confirmArchive")) && run(() => statusAction(versionId, "ARCHIVED"), () => router.refresh())}>{t("archive")}</Button> : null}
        {status === "ARCHIVED" ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => statusAction(versionId, "DRAFT"), () => router.refresh())}>{t("reopen")}</Button> : null}
        <Select className="h-8 w-32 text-xs" value={year} onChange={(e) => setYear(e.target.value)} aria-label={t("cloneTo")}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </Select>
        <Button size="sm" variant="outline" disabled={pending || !year} onClick={() => run(() => cloneAction(versionId, year), (d) => router.push(`/admin/procedures/${d.id}`))}>{t("clone")}</Button>
      </div>
    </div>
  );
}

export function DependencyControls({ requirementId, options }: { requirementId: string; options: Array<{ id: string; label: string }> }) {
  const t = useTranslations("admin.procedures");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [pick, setPick] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Select className="h-8 w-64 text-xs" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("addPrerequisite")}>
        <option value="">{t("addPrerequisite")}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </Select>
      <Button size="sm" variant="outline" disabled={pending || !pick} onClick={() => run(() => addDependencyAction(requirementId, pick), () => { setPick(""); router.refresh(); })}>{t("add")}</Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function RemoveDependency({ id }: { id: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useActionRunner();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeDependencyAction(id), () => router.refresh())}>{t("remove")}</Button>;
}

/** Migrating a case is explicit: preview the requirement diff first, then confirm. */
export function MigrateCase({ caseId, toVersionId, label }: { caseId: string; toVersionId: string; label: string }) {
  const t = useTranslations("admin.procedures");
  const router = useRouter();
  const preview = useActionRunner();
  const apply = useActionRunner();
  const [diff, setDiff] = useState<MigrationDiff | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{label}</span>
        <Button size="sm" variant="outline" disabled={preview.pending} onClick={() => preview.run(() => previewMigrationAction(caseId, toVersionId), (d) => setDiff(d))}>{t("previewDiff")}</Button>
      </div>
      {preview.error || apply.error ? <p className="text-xs text-danger">{preview.error ?? apply.error}</p> : null}
      {diff ? (
        <Alert tone="info" title={t("diffTitle")}>
          <p>{t("diffAdded", { n: diff.added.length })}: {diff.added.map((a) => a.code).join(", ") || "—"}</p>
          <p>{t("diffRemoved", { n: diff.removed.length })}: {diff.removed.map((a) => `${a.code}${a.hasDocuments ? " ✱" : ""}`).join(", ") || "—"}</p>
          <p>{t("diffUnchanged", { n: diff.unchanged })}</p>
          {diff.removed.some((r) => r.hasDocuments) ? <p className="mt-1 text-xs">✱ {t("keepsDocuments")}</p> : null}
          <Button className="mt-2" size="sm" disabled={apply.pending} onClick={() => apply.run(() => migrateAction(caseId, toVersionId), () => { setDiff(null); router.refresh(); })}>{t("confirmMigrate")}</Button>
        </Alert>
      ) : null}
    </div>
  );
}
