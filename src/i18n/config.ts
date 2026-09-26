export const LOCALES = ["fr", "en", "ar", "it"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(["ar"]);

export const LOCALE_NAMES: Record<AppLocale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
  it: "Italiano",
};

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirFor(locale: AppLocale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
