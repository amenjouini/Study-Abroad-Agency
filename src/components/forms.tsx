"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, type DefaultValues, type FieldErrors, type FieldValues, type Resolver } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/server/action";

/** react-hook-form + zod: the same schema validates on the client (UX) and on the server (authority). */
export function useZodForm<T extends FieldValues>(schema: z.ZodType, defaultValues: DefaultValues<T>) {
  return useForm<T>({ resolver: zodResolver(schema as never) as unknown as Resolver<T>, defaultValues });
}

/** Runs a server action inside a transition and exposes a translated error message. */
export function useActionRunner() {
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        onOk?.(res.data);
      } else {
        setError(res.code === "conflict" || res.code === "validation" ? res.message || tc(`errors.${res.code}` as never) : tc(`errors.${res.code}` as never));
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }
  return { run, pending, error, setError, fieldErrors };
}

/** Translated message for a react-hook-form field error. */
export function fieldMessage(errors: FieldErrors, name: string, t: (k: string) => string): string | undefined {
  const parts = name.split(".");
  let cur: unknown = errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  if (!cur) return undefined;
  return t("errors.validation");
}
