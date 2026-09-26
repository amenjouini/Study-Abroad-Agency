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

/**
 * Catalog fragments (messages/<locale>/<name>.json), one per feature area.
 * Student-facing fragments must exist in all four locales; staff/admin fragments exist in fr + en only
 * (other locales fall back to French).
 */
export const STUDENT_FRAGMENTS = ["core", "enums", "wizard", "student", "notifications"] as const;
export const STAFF_FRAGMENTS = ["staff-enums", "staff", "admin"] as const;
export const FRAGMENTS = [...STUDENT_FRAGMENTS, ...STAFF_FRAGMENTS] as const;

async function loadFragments(locale: AppLocale): Promise<Messages> {
  let out: Messages = {};
  for (const name of FRAGMENTS) {
    try {
      const mod = (await import(`../../messages/${locale}/${name}.json`)) as { default: Messages };
      out = mergeMessages(out, mod.default);
    } catch {
      // fragment not provided for this locale: falls back to French
    }
  }
  return out;
}

export async function loadMessages(locale: AppLocale): Promise<Messages> {
  const fr = await loadFragments("fr");
  if (locale === "fr") return fr;
  return mergeMessages(fr, await loadFragments(locale));
}
