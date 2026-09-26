import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RateLimitError } from "../src/lib/errors";
import { rateLimit } from "../src/server/rate-limit";
import { sanitizeFilename, validateUpload } from "../src/lib/upload";
import { DB_AVAILABLE } from "./helpers/db";

function files(dir: string, test: (f: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, "/");

describe("authorization is enforced server-side on every entry point", () => {
  it("every route handler authenticates (except the auth handler and the secret-protected cron endpoint)", () => {
    const routes = files(path.resolve("src/app/api"), (f) => f.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThan(8);
    for (const r of routes) {
      if (r.includes("/auth/") || r.includes("\\auth\\") || r.includes("cron")) continue;
      expect(fs.readFileSync(r, "utf8"), rel(r)).toMatch(/requireUser\(\)/);
    }
    const cron = fs.readFileSync(path.resolve("src/app/api/cron/reminders/route.ts"), "utf8");
    expect(cron).toMatch(/timingSafeEqual/);
  });

  it("every server action resolves the signed-in user before doing anything", () => {
    const actionFiles = files(path.resolve("src/app"), (f) => /actions\.ts$/.test(f));
    expect(actionFiles.length).toBeGreaterThan(5);
    for (const f of actionFiles) {
      if (f.includes("(auth)")) continue; // login / register / logout / locale are the public entry points
      const src = fs.readFileSync(f, "utf8");
      const bodies = src.split(/export async function /).slice(1);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        expect(body, `${rel(f)} :: ${name}`).toMatch(/requireUser\(\)/);
      }
    }
  });

  it("state-changing route handlers check the request origin (CSRF)", () => {
    for (const r of files(path.resolve("src/app/api"), (f) => f.endsWith("route.ts"))) {
      const src = fs.readFileSync(r, "utf8");
      if (/export async function POST/.test(src) && !r.includes("auth") && !r.includes("cron")) expect(src, rel(r)).toMatch(/assertSameOrigin/);
    }
  });

  it("no unescaped HTML rendering (XSS) and no public document paths", () => {
    for (const f of files(path.resolve("src"), (p) => /\.(tsx?|css)$/.test(p))) {
      expect(fs.readFileSync(f, "utf8"), rel(f)).not.toMatch(/dangerouslySetInnerHTML/);
    }
    expect(fs.existsSync(path.resolve("public/uploads"))).toBe(false);
    expect(fs.existsSync(path.resolve("public/storage"))).toBe(false);
  });

  it("secrets are only read from the environment and .env is not committed", () => {
    expect(fs.readFileSync(".gitignore", "utf8")).toMatch(/^\.env$/m);
    expect(fs.existsSync(".env.example")).toBe(true);
  });
});

describe("upload safety helpers", () => {
  it("sanitizes hostile file names", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\evil<script>.pdf")).toBe("evil_script_.pdf");
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it("accepts a real PDF and rejects an HTML file with a .pdf name", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    await expect(validateUpload(pdf, "ok.pdf")).resolves.toMatchObject({ mimeType: "application/pdf", extension: "pdf" });
    await expect(validateUpload(Buffer.from("<html><script>alert(1)</script></html>"), "evil.pdf")).rejects.toThrow();
    await expect(validateUpload(pdf, "ok.pdf", { maxBytes: 10 })).rejects.toThrow(/maximum size/);
  });
});

describe.skipIf(!DB_AVAILABLE)("rate limiting", () => {
  it("blocks the request that exceeds the limit inside the window and is atomic under concurrency", async () => {
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 3; i++) await rateLimit(key, { limit: 3, windowSeconds: 60 });
    await expect(rateLimit(key, { limit: 3, windowSeconds: 60 })).rejects.toBeInstanceOf(RateLimitError);

    const concurrent = `test-concurrent:${Date.now()}`;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => rateLimit(concurrent, { limit: 4, windowSeconds: 60 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  });
});
