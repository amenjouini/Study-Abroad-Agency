import "dotenv/config";
import { db } from "../src/lib/db";
import { seedReferenceData, seedRolesAndPermissions } from "./seed/reference";
import { seedProcedures, seedScholarships } from "./seed/procedure";
import { seedOwnerFromEnv } from "./seed/owner";

async function main() {
  console.log("Seeding roles and permissions…");
  await seedRolesAndPermissions(db);
  console.log("Seeding reference data (countries, years, holidays, cities, universities, programs, stages)…");
  await seedReferenceData(db);
  console.log("Seeding procedures (Italy — Tunisia 2026/27 v1 ACTIVE, 2027/28 v1 DRAFT)…");
  await seedProcedures(db);
  console.log("Seeding scholarships (DSU Toscana 2026/27)…");
  await seedScholarships(db);
  await seedOwnerFromEnv(db);

  if (process.env.SEED_DEMO !== "false") {
    const { seedDemo } = await import("./seed/demo");
    console.log("Seeding demo accounts, students and cases…");
    await seedDemo(db);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
