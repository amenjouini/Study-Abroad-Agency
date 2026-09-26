import { db } from "../../src/lib/db";

/** True when a migrated + seeded PostgreSQL is reachable. Integration tests are skipped (loudly) otherwise. */
export async function dbReady(): Promise<boolean> {
  try {
    const roles = await db.role.count();
    return roles > 0;
  } catch {
    return false;
  }
}

export const DB_AVAILABLE = await dbReady();
if (!DB_AVAILABLE) {
  const msg = "Database not reachable/seeded: DB integration tests are being skipped (run db:migrate + db:seed).";
  if (process.env.REQUIRE_DB_TESTS === "1") throw new Error(msg);
  console.warn(`\n⚠ ${msg}\n`);
}
