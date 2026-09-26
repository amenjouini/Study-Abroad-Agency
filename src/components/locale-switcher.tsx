"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/(auth)/actions";
import { LOCALES, LOCALE_NAMES, type AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Language"
      value={locale}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setLocaleAction(e.target.value);
          router.refresh();
        })
      }
      className={cn("h-9 rounded-md border border-input bg-card px-2 text-sm", className)}
    >
      {LOCALES.map((l: AppLocale) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
