import type { AppLocale } from "@/i18n/config";

const INTL_LOCALE: Record<AppLocale, string> = { fr: "fr-TN", en: "en-GB", ar: "ar-TN-u-nu-latn", it: "it-IT" };

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale as AppLocale] ?? "fr-TN";
}

export function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined, locale: string, timeZone = "Africa/Tunis"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(d);
}

/** Pick the best translation from an i18n JSON column: requested locale, then English, then French, then fallback. */
export function localized(json: unknown, locale: string, fallback = ""): string {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of [locale, "en", "fr"]) {
      const v = o[key];
      if (typeof v === "string" && v) return v;
    }
  }
  return fallback;
}

/**
 * Sponsor labels are stored as "<RELATIONSHIP_CODE> — <full name>" so they can be shown in the reader's language.
 * `translateRelationship` returns the localized relationship or undefined when the code is unknown.
 */
export function localizeSubjectLabel(label: string, translateRelationship: (code: string) => string | undefined): string {
  const m = /^([A-Z_]+) — (.+)$/.exec(label);
  if (!m) return label;
  const rel = translateRelationship(m[1]);
  return rel ? `${rel} — ${m[2]}` : label;
}
