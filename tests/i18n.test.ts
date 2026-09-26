import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { STAFF_FRAGMENTS, STUDENT_FRAGMENTS } from "../src/i18n/messages";

const root = path.resolve("messages");
const load = (locale: string, name: string): Record<string, unknown> | null => {
  const file = path.join(root, locale, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};

function flatten(o: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

describe("translation catalogs", () => {
  it("student-facing fragments exist in all four locales with the same keys as French", () => {
    for (const name of STUDENT_FRAGMENTS) {
      const fr = flatten(load("fr", name));
      expect(Object.keys(fr).length, `fr/${name}`).toBeGreaterThan(0);
      for (const locale of ["en", "ar", "it"]) {
        const other = flatten(load(locale, name));
        const missing = Object.keys(fr).filter((k) => !(k in other));
        if (locale === "en" || name !== "core") {
          expect(missing, `${locale}/${name} is missing keys`).toEqual([]);
        }
        const extra = Object.keys(other).filter((k) => !(k in fr));
        expect(extra, `${locale}/${name} has keys unknown to French`).toEqual([]);
      }
    }
  });

  it("staff and admin fragments exist in French and English with identical keys (other locales fall back to French)", () => {
    for (const name of STAFF_FRAGMENTS) {
      const fr = flatten(load("fr", name));
      const en = flatten(load("en", name));
      expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
      expect(load("ar", name)).toBeNull();
      expect(load("it", name)).toBeNull();
    }
  });

  it("every message is valid ICU MessageFormat and uses the same placeholders in every language", () => {
    const names = [...STUDENT_FRAGMENTS, ...STAFF_FRAGMENTS];
    const placeholders = (msg: string) =>
      [...new Set([...msg.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    const reference = new Map<string, string[]>();
    for (const locale of ["fr", "en", "it", "ar"]) {
      for (const name of names) {
        const flat = flatten(load(locale, name));
        for (const [key, msg] of Object.entries(flat)) {
          expect(() => new IntlMessageFormat(msg, locale), `${locale}/${name}:${key}`).not.toThrow();
          const ph = placeholders(msg);
          if (locale === "fr") reference.set(`${name}:${key}`, ph);
          else if (reference.has(`${name}:${key}`)) expect(ph, `${locale}/${name}:${key}`).toEqual(reference.get(`${name}:${key}`));
        }
      }
    }
  });

  it("empty strings are never used as translations", () => {
    for (const locale of ["fr", "en", "it", "ar"]) {
      for (const name of [...STUDENT_FRAGMENTS, ...STAFF_FRAGMENTS]) {
        for (const [k, v] of Object.entries(flatten(load(locale, name)))) expect(v.trim(), `${locale}/${name}:${k}`).not.toBe("");
      }
    }
  });
});

describe("RTL support", () => {
  it("components use logical CSS properties (start/end) instead of left/right", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "generated") walk(p);
        } else if (/\.(tsx|css)$/.test(entry.name)) {
          const src = fs.readFileSync(p, "utf8");
          // physical utilities that break in RTL: ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/rounded-l/rounded-r/border-l/border-r
          const re = /(?<![\w-])(?:-?m[lr]-\S|p[lr]-\d|left-\d|right-\d|text-left|text-right|rounded-[lr]-|rounded-[lr]\b|border-[lr]\b|border-[lr]-)/g;
          const m = src.match(re);
          if (m) offenders.push(`${p}: ${[...new Set(m)].join(", ")}`);
        }
      }
    };
    walk(path.resolve("src"));
    expect(offenders).toEqual([]);
  });

  it("Arabic is the only RTL locale", async () => {
    const { dirFor } = await import("../src/i18n/config");
    expect(dirFor("ar")).toBe("rtl");
    for (const l of ["fr", "en", "it"] as const) expect(dirFor(l)).toBe("ltr");
  });
});
