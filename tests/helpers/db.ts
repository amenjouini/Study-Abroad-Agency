import { db } from "../../src/lib/db";
import type { AuthUser } from "../../src/server/authz";

async function dbReady(): Promise<boolean> {
  if (process.env.DB_UNREACHABLE === "1") return false;
  try {
    return (await db.role.count()) > 0;
  } catch {
    return false;
  }
}

/** True when the throwaway test database is reachable and seeded. Otherwise DB tests are skipped (loudly). */
export const DB_AVAILABLE = await dbReady();
if (!DB_AVAILABLE) {
  const msg = "PostgreSQL not reachable: DB integration tests are being skipped (start PostgreSQL, see README).";
  if (process.env.REQUIRE_DB_TESTS === "1") throw new Error(msg);
  console.warn(`\n⚠ ${msg}\n`);
}

export async function authFor(email: string): Promise<AuthUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { role: true, student: { select: { id: true } } } });
  return { id: u.id, name: u.name, email: u.email, roleKey: u.role.key as AuthUser["roleKey"], locale: u.locale, studentId: u.student?.id ?? null };
}

export async function caseOf(email: string) {
  return db.case.findFirstOrThrow({ where: { student: { user: { email } } } });
}

export async function instanceOf(email: string, code: string, subjectId?: string) {
  const c = await caseOf(email);
  return db.documentRequirementInstance.findFirstOrThrow({
    where: { caseId: c.id, requirement: { code }, ...(subjectId ? { subjectId } : {}) },
    include: { requirement: true, documents: { include: { versions: { orderBy: { versionNumber: "asc" } } } } },
  });
}
