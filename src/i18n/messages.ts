import type { AppLocale } from "./config";

type Messages = Record<string, unknown>;

function isObject(v: unknown): v is Messages {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep merge: keys missing in `override` fall back to `base` (e.g. staff/admin screens fall back to French). */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isObject(v) && isObject(base[k]) ? mergeMessages(base[k] as Messages, v) : v;
  }
  return out;
}

export async function loadMessages(locale: AppLocale): Promise<Messages> {
  const fr = (await import("../../messages/fr.json")).default as Messages;
  if (locale === "fr") return fr;
  const other = (await import(`../../messages/${locale}.json`)).default as Messages;
  return mergeMessages(fr, other);
}
