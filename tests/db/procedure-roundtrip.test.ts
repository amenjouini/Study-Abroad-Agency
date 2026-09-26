import { describe, expect, it } from "vitest";
import { italy2026Definition } from "../../prisma/seed/procedure-data";
import { db } from "../../src/lib/db";
import { evaluateCase } from "../../src/lib/engine/evaluate";
import type { EngineResult } from "../../src/lib/engine/types";
import { loadProcedureDefinition } from "../../src/server/procedure-loader";
import { DB_AVAILABLE } from "../helpers/db";
import { makeApplication, makeFacts, makeSponsor } from "../helpers/facts";

const strip = (r: EngineResult) => ({ ...r, instances: r.instances.map(({ requirementId: _id, ...rest }) => rest) });

describe.skipIf(!DB_AVAILABLE)("procedure stored in the database", () => {
  it("the ACTIVE 2026/27 version loaded from the database behaves exactly like the seed data", async () => {
    const version = await db.procedureVersion.findFirstOrThrow({
      where: { status: "ACTIVE", academicYear: { label: "2026/27" } },
    });
    const fromDb = await loadProcedureDefinition(version.id);
    const mem = italy2026Definition();

    expect(fromDb.parameters).toEqual(mem.parameters);
    expect(fromDb.requirements.map((r) => r.code).sort()).toEqual(mem.requirements.map((r) => r.code).sort());
    expect(fromDb.dependencies.length).toBe(mem.dependencies.length);
    expect(fromDb.deadlines.map((d) => d.code).sort()).toEqual(mem.deadlines.map((d) => d.code).sort());

    const scenarios = [
      makeFacts(),
      makeFacts({ sponsors: [makeSponsor({ professionalStatus: "RETIRED", pensionFund: "CNRPS" })] }),
      makeFacts({ sponsors: [makeSponsor({ professionalStatus: "BUSINESS_OWNER" })] }),
      makeFacts({ sponsors: [makeSponsor({ relationship: "FRIEND" })] }),
      makeFacts({
        applications: [
          makeApplication({
            status: "ENROLLED",
            visa: { stage: "PASSPORT_RETURNED", arrivalDate: "2026-12-01", appointmentDate: "2026-10-10", programId: "a", intendedEnrollmentProgramId: "b" },
          }),
        ],
      }),
    ];
    for (const facts of scenarios) {
      expect(strip(evaluateCase(facts, fromDb))).toEqual(strip(evaluateCase(facts, mem)));
    }
  });

  it("the published minimum stored in the database is 10,179.85 EUR (not 783.06 × 13)", async () => {
    const p = await db.procedureParameter.findFirstOrThrow({
      where: { key: "financial.published_minimum_total", version: { status: "ACTIVE" } },
    });
    expect(p.value).toEqual({ amountMinor: 1017985, currency: "EUR" });
  });

  it("2027/28 v1 is a DRAFT containing only the 31 October 2027 visa-appointment deadline", async () => {
    const v = await db.procedureVersion.findFirstOrThrow({
      where: { academicYear: { label: "2027/28" } },
      include: { deadlines: true, requirements: true, parameters: true },
    });
    expect(v.status).toBe("DRAFT");
    expect(v.requirements).toHaveLength(0);
    expect(v.parameters).toHaveLength(0);
    expect(v.deadlines).toHaveLength(1);
    expect(v.deadlines[0].fixedDate?.toISOString().slice(0, 10)).toBe("2027-10-31");
  });
});
