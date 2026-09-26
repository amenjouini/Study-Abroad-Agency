"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import type { ActionResult } from "@/server/action";

export interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "email" | "datetime-local";
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
}

/**
 * Config-driven form for admin entities. Values are posted to a server action that validates them with zod
 * and checks permissions again: the client only renders inputs.
 */
export function ConfigForm({
  fields,
  initial,
  action,
  submitLabel,
  resetOnSuccess,
  onDone,
}: {
  fields: FieldConfig[];
  initial: Record<string, string | boolean>;
  action: (values: Record<string, string | boolean>) => Promise<ActionResult<unknown>>;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  onDone?: () => void;
}) {
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending, error, fieldErrors } = useActionRunner();
  const [values, setValues] = useState<Record<string, string | boolean>>(initial);
  const [saved, setSaved] = useState(false);
  const set = (name: string, v: string | boolean) => {
    setValues((p) => ({ ...p, [name]: v }));
    setSaved(false);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => action(values),
          () => {
            setSaved(true);
            if (resetOnSuccess) setValues(initial);
            router.refresh();
            onDone?.();
          },
        );
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const err = fieldErrors[f.name]?.[0];
          const common = { id: `f-${f.name}`, name: f.name, required: f.required, placeholder: f.placeholder };
          return (
            <Field key={f.name} label={f.type === "checkbox" ? undefined : f.label} htmlFor={common.id} hint={f.hint} error={err} className={f.wide || f.type === "textarea" ? "sm:col-span-2" : undefined}>
              {f.type === "textarea" ? (
                <Textarea {...common} rows={3} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              ) : f.type === "select" ? (
                <Select {...common} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  {!f.required ? <option value="">—</option> : null}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} className="accent-[var(--primary)]" />
                  {f.label}
                </label>
              ) : (
                <Input {...common} type={f.type} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tc("loading") : (submitLabel ?? tc("save"))}
        </Button>
        {saved ? <span className="text-sm text-success">{tc("saved")}</span> : null}
      </div>
    </form>
  );
}
