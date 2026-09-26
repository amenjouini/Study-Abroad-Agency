import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import "dotenv/config";

const STORAGE_DIR = path.resolve(".test-storage");

/**
 * Integration tests run against a throwaway database (`<name>_test`) that is dropped, migrated and seeded
 * (including demo data) before every run, so tests can mutate freely and the dev database is never touched.
 * When PostgreSQL is not reachable, DB tests are skipped with a warning (REQUIRE_DB_TESTS=1 makes that an error).
 */
export async function setup() {
  const base = process.env.DATABASE_URL;
  if (!base) return;
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(base);
  testUrl.pathname = `/${testDb}`;

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch {
    process.env.DB_UNREACHABLE = "1";
    return;
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.end();
  }

  const env = { ...process.env, DATABASE_URL: testUrl.toString(), STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: STORAGE_DIR };
  fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });

  // Workers inherit these
  process.env.DATABASE_URL = testUrl.toString();
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = STORAGE_DIR;
}

export async function teardown() {
  fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
}
