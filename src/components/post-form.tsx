"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";

/** POST a multipart form to one of our authorized API routes and translate the failure. */
export function usePostForm(endpoint: string, onSuccess?: () => void) {
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(form: HTMLFormElement, extra?: Record<string, string>) {
    setPending(true);
    setError(null);
    setDone(false);
    const body = new FormData(form);
    for (const [k, v] of Object.entries(extra ?? {})) body.set(k, v);
    try {
      const res = await fetch(endpoint, { method: "POST", body });
      if (res.ok) {
        setDone(true);
        form.reset();
        onSuccess?.();
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const code = data.error && ["forbidden", "not_found", "validation", "conflict", "rate_limited", "unauthenticated"].includes(data.error) ? data.error : "unexpected";
        setError(code === "validation" || code === "conflict" ? (data.message ?? tc(`errors.${code}` as never)) : tc(`errors.${code}` as never));
      }
    } catch {
      setError(tc("errors.unexpected"));
    } finally {
      setPending(false);
    }
  }
  return { submit, pending, error, done };
}

export function MessageForm({ endpoint = "/api/messages", caseId, placeholder, sendLabel, attachLabel }: { endpoint?: string; caseId?: string; placeholder: string; sendLabel: string; attachLabel: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, error } = usePostForm(endpoint);
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget, caseId ? { caseId } : undefined);
      }}
      className="space-y-2"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Textarea name="body" required minLength={1} maxLength={4000} rows={3} placeholder={placeholder} aria-label={placeholder} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="cursor-pointer text-xs text-primary hover:underline">
          {attachLabel}
          <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="sr-only" />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {sendLabel}
        </Button>
      </div>
    </form>
  );
}
