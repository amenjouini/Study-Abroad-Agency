import { describe, expect, it } from "vitest";
import { italy2026Definition } from "../prisma/seed/procedure-data";
import { evaluateCase } from "../src/lib/engine/evaluate";
import { reconcileInstances } from "../src/lib/engine/reconcile";
import { canComplete } from "../src/lib/engine/dependencies";
import type { EngineResult, ExistingInstance, RequiredInstance } from "../src/lib/engine/types";
import { makeApplication, makeFacts, makeSponsor } from "./helpers/facts";

const proc = italy2026Definition();

const forSponsor = (r: EngineResult, sponsorId: string) =>
  r.instances.filter((i) => i.subjectType === "SPONSOR" && i.subjectId === sponsorId).map((i) => i.requirementCode);

describe("requirement engine — sponsor workflows", () => {
  it("employee sponsor → employment, payslips, CNSS, bank statement, ID, relationship proof", () => {
    const r = evaluateCase(makeFacts(), proc);
    expect(forSponsor(r, "sp-father").sort()).toEqual(
      [
        "BANK_STATEMENT_6_MONTHS",
        "CNSS_CERTIFICATE",
        "EMPLOYMENT_CERTIFICATE",
        "PAYSLIPS_LAST_6",
        "RELATIONSHIP_PROOF",
        "SPONSOR_ID",
      ].sort(),
    );
    expect(r.requiresHumanReview).toBe(false);
  });

  it("retired sponsor (CNRPS) → pension documentation for the stated fund only", () => {
    const facts = makeFacts({
      sponsors: [makeSponsor({ id: "sp-mother", label: "Mother", relationship: "MOTHER", professionalStatus: "RETIRED", pensionFund: "CNRPS" })],
    });
    const codes = forSponsor(evaluateCase(facts, proc), "sp-mother");
    expect(codes).toContain("RETIREMENT_CERTIFICATE");
    expect(codes).toContain("PENSION_DOCS_CNRPS");
    expect(codes).not.toContain("PENSION_DOCS_CNSS");
    expect(codes).not.toContain("EMPLOYMENT_CERTIFICATE");
    expect(codes).toContain("BANK_STATEMENT_6_MONTHS");
  });

  it("retired sponsor without a stated pension fund → human review (never assumed)", () => {
    const facts = makeFacts({ sponsors: [makeSponsor({ professionalStatus: "RETIRED", pensionFund: null })] });
    const r = evaluateCase(facts, proc);
    expect(r.humanReviewFlags.map((f) => f.code)).toContain("PENSION_FUND_REVIEW");
  });

  it("business-owner sponsor → business, registry, company, tax and bank documents", () => {
    const facts = makeFacts({ sponsors: [makeSponsor({ id: "sp-b", professionalStatus: "BUSINESS_OWNER" })] });
    const codes = forSponsor(evaluateCase(facts, proc), "sp-b");
    for (const c of [
      "BUSINESS_REGISTRATION",
      "COMMERCIAL_REGISTRY_EXTRACT",
      "COMPANY_DOCUMENTS",
      "TAX_DOCUMENTATION",
      "COMPANY_BANK_STATEMENTS",
      "BANK_STATEMENT_6_MONTHS",
      "SPONSOR_ID",
      "RELATIONSHIP_PROOF",
    ]) {
      expect(codes).toContain(c);
    }
    expect(codes).not.toContain("PAYSLIPS_LAST_6");
  });

  it("changing the sponsor status changes the checklist", () => {
    const employee = forSponsor(evaluateCase(makeFacts(), proc), "sp-father");
    const professional = forSponsor(
      evaluateCase(makeFacts({ sponsors: [makeSponsor({ professionalStatus: "PROFESSIONAL" })] }), proc),
      "sp-father",
    );
    expect(employee).toContain("PAYSLIPS_LAST_6");
    expect(professional).not.toContain("PAYSLIPS_LAST_6");
    expect(professional).toContain("PROFESSIONAL_REGISTRATION");
  });

  it("family friend → REQUIRES_HUMAN_REVIEW, no guessed checklist", () => {
    const facts = makeFacts({ sponsors: [makeSponsor({ id: "sp-f", label: "Family friend", relationship: "FRIEND" })] });
    const r = evaluateCase(facts, proc);
    expect(forSponsor(r, "sp-f")).toEqual(["SPONSOR_RELATIONSHIP_REVIEW"]);
    const inst = r.instances.find((i) => i.requirementCode === "SPONSOR_RELATIONSHIP_REVIEW")!;
    expect(inst.status).toBe("REQUIRES_HUMAN_REVIEW");
    expect(r.requiresHumanReview).toBe(true);
  });

  it("sponsor with OTHER status or no income → REQUIRES_HUMAN_REVIEW", () => {
    for (const status of ["OTHER", "UNEMPLOYED_NO_INCOME"]) {
      const r = evaluateCase(makeFacts({ sponsors: [makeSponsor({ professionalStatus: status })] }), proc);
      expect(r.humanReviewFlags.map((f) => f.code)).toContain("SPONSOR_STATUS_REVIEW");
    }
  });

  it("self-funded → REQUIRES_HUMAN_REVIEW", () => {
    const facts = makeFacts({
      sponsors: [],
      fundingSources: [{ id: "fs-1", type: "SELF_FUNDED", label: "Personal savings", amount: { amountMinor: 1017985, currency: "EUR" } }],
    });
    const r = evaluateCase(facts, proc);
    expect(r.humanReviewFlags.map((f) => f.code)).toContain("SELF_FUNDED_REVIEW");
    expect(r.funding!.available.amountMinor).toBe(0);
  });

  it("two sponsors → separate requirement instances per subject", () => {
    const facts = makeFacts({
      sponsors: [
        makeSponsor(),
        makeSponsor({ id: "sp-uncle", label: "Uncle", relationship: "UNCLE_AUNT", professionalStatus: "BUSINESS_OWNER" }),
      ],
    });
    const r = evaluateCase(facts, proc);
    const bank = r.instances.filter((i) => i.requirementCode === "BANK_STATEMENT_6_MONTHS");
    expect(bank).toHaveLength(2);
    expect(new Set(bank.map((b) => b.key)).size).toBe(2);
    expect(bank.map((b) => b.subjectLabel).sort()).toEqual(["Father", "Uncle"]);
  });
});

describe("requirement engine — diploma pathway and program language", () => {
  it("Master applicants follow the university-degree pathway; bachelor applicants the secondary-diploma one", () => {
    const master = evaluateCase(makeFacts(), proc).instances.map((i) => i.requirementCode);
    expect(master).toContain("DEGREE_DIPLOMA");
    expect(master).not.toContain("SECONDARY_DIPLOMA");
    const bachelor = evaluateCase(
      makeFacts({ student: { ...makeFacts().student, desiredDegreeLevel: "BACHELOR" } }),
      proc,
    ).instances.map((i) => i.requirementCode);
    expect(bachelor).toContain("SECONDARY_DIPLOMA");
    expect(bachelor).not.toContain("DEGREE_DIPLOMA");
  });

  it("language requirement follows the program language", () => {
    const en = evaluateCase(makeFacts(), proc).instances.map((i) => i.requirementCode);
    expect(en).toContain("LANGUAGE_PROOF_EN");
    expect(en).not.toContain("LANGUAGE_CERTIFICATE_IT");
    const it = evaluateCase(
      makeFacts({
        applications: [
          {
            ...makeFacts().applications[0],
            program: { id: "p2", name: "Laurea", degreeLevel: "BACHELOR", language: "IT", durationMonths: 36 },
          },
        ],
      }),
      proc,
    ).instances.map((i) => i.requirementCode);
    expect(it).toContain("LANGUAGE_CERTIFICATE_IT");
  });

  it("rejected applications produce no application-level requirements", () => {
    const facts = makeFacts({ applications: [{ ...makeFacts().applications[0], status: "REJECTED" }] });
    const codes = evaluateCase(facts, proc).instances.map((i) => i.requirementCode);
    expect(codes).not.toContain("VISA_APPLICATION_FORM");
  });
});

describe("bank blocking waiver", () => {
  const withScholarship = (kind: string, amountMinor: number) =>
    makeFacts({
      scholarships: [{ id: "s1", name: "Scholarship", kind, status: "AWARDED", amountEur: { amountMinor, currency: "EUR" } }],
    });
  it("Italian government scholarship at or above the published minimum waives the bank blocking letter", () => {
    const r = evaluateCase(withScholarship("ITALIAN_GOVERNMENT", 1017985), proc);
    expect(r.instances.map((i) => i.requirementCode)).not.toContain("BANK_BLOCKING_LETTER");
  });
  it("does not apply to other scholarships, or to amounts below the minimum", () => {
    expect(evaluateCase(withScholarship("REGIONAL", 2000000), proc).instances.map((i) => i.requirementCode)).toContain("BANK_BLOCKING_LETTER");
    expect(evaluateCase(withScholarship("ITALIAN_GOVERNMENT", 600000), proc).instances.map((i) => i.requirementCode)).toContain("BANK_BLOCKING_LETTER");
  });
});

describe("visa / course consistency", () => {
  it("flags visa.program ≠ intended enrollment program as a serious human-review issue", () => {
    const app = makeApplication({
      status: "ACCEPTED",
      visa: { stage: "SUBMITTED", programId: "prog-a", intendedEnrollmentProgramId: "prog-b" },
    });
    const r = evaluateCase(makeFacts({ applications: [app] }), proc);
    expect(r.visaMismatches).toEqual([app.id]);
    expect(r.humanReviewFlags.map((f) => f.code)).toContain("VISA_PROGRAM_MISMATCH_REVIEW");
  });
  it("no flag when the programs match", () => {
    const app = makeApplication({ visa: { stage: "SUBMITTED", programId: "prog-a", intendedEnrollmentProgramId: "prog-a" } });
    const r = evaluateCase(makeFacts({ applications: [app] }), proc);
    expect(r.visaMismatches).toEqual([]);
  });
});

describe("re-evaluation", () => {
  const toExisting = (list: RequiredInstance[], overrides: Record<string, Partial<ExistingInstance>> = {}): ExistingInstance[] =>
    list.map((i, idx) => ({
      id: `inst-${idx}`,
      key: i.key,
      status: i.status ?? "NOT_STARTED",
      hasDocuments: false,
      deadline: i.deadline,
      ...overrides[i.key],
    }));

  it("marks instances that no longer apply NOT_APPLICABLE and keeps them (never deletes)", () => {
    const before = evaluateCase(makeFacts(), proc);
    const existing = toExisting(before.instances, {
      "PAYSLIPS_LAST_6|SPONSOR|sp-father": { status: "APPROVED", hasDocuments: true },
    });
    const after = evaluateCase(makeFacts({ sponsors: [makeSponsor({ professionalStatus: "RETIRED", pensionFund: "CNSS" })] }), proc);
    const plan = reconcileInstances(existing, after.instances);

    const dropped = plan.markNotApplicable.map((e) => e.key);
    expect(dropped).toContain("PAYSLIPS_LAST_6|SPONSOR|sp-father");
    expect(dropped).toContain("EMPLOYMENT_CERTIFICATE|SPONSOR|sp-father");
    // the plan has no delete operation at all, and dropped instances keep their document flag
    expect(plan).not.toHaveProperty("delete");
    expect(plan.markNotApplicable.find((e) => e.key.startsWith("PAYSLIPS"))!.hasDocuments).toBe(true);
    expect(plan.create.map((c) => c.requirementCode)).toContain("RETIREMENT_CERTIFICATE");
    // still-applicable instances are untouched
    expect(dropped).not.toContain("SPONSOR_ID|SPONSOR|sp-father");
  });

  it("reactivates a NOT_APPLICABLE instance and restores its previous status when it applies again", () => {
    const facts = makeFacts();
    const result = evaluateCase(facts, proc);
    const existing = toExisting(result.instances, {
      "PAYSLIPS_LAST_6|SPONSOR|sp-father": { status: "NOT_APPLICABLE", previousStatus: "APPROVED", hasDocuments: true },
    });
    const plan = reconcileInstances(existing, result.instances);
    const re = plan.reactivate.find((r) => r.existing.key.startsWith("PAYSLIPS"))!;
    expect(re.restoreStatus).toBe("APPROVED");
  });

  it("is a no-op when nothing changed", () => {
    const result = evaluateCase(makeFacts(), proc);
    const plan = reconcileInstances(toExisting(result.instances), result.instances);
    expect(plan.create).toEqual([]);
    expect(plan.markNotApplicable).toEqual([]);
    expect(plan.reactivate).toEqual([]);
  });

  it("is deterministic: same input, same output", () => {
    expect(evaluateCase(makeFacts(), proc)).toEqual(evaluateCase(makeFacts(), proc));
  });
});

describe("dependencies", () => {
  const instances = (legalization: "NOT_STARTED" | "APPROVED", diploma: "UPLOADED" | "APPROVED") => [
    { requirementCode: "DEGREE_DIPLOMA", subjectType: "STUDENT" as const, subjectId: "s", status: diploma },
    { requirementCode: "DEGREE_LEGALIZATION", subjectType: "STUDENT" as const, subjectId: "s", status: legalization },
  ];
  it("a dependent requirement cannot complete before its prerequisite", () => {
    const all = instances("NOT_STARTED", "UPLOADED");
    const res = canComplete(all[1], all, proc.dependencies);
    expect(res.ok).toBe(false);
    expect(res.blockedBy.map((b) => b.requirementCode)).toEqual(["DEGREE_DIPLOMA"]);
  });
  it("can complete once the prerequisite is approved", () => {
    const all = instances("NOT_STARTED", "APPROVED");
    expect(canComplete(all[1], all, proc.dependencies).ok).toBe(true);
  });
  it("the full chain is ordered diploma → legalization → translation → apostille → value declaration", () => {
    const chain = ["DEGREE_LEGALIZATION", "DEGREE_TRANSLATION", "DEGREE_APOSTILLE", "DEGREE_VALUE_DECLARATION"];
    const prereqs = chain.map((c) => proc.dependencies.find((d) => d.requirementCode === c)!.prerequisiteCode);
    expect(prereqs).toEqual(["DEGREE_DIPLOMA", "DEGREE_LEGALIZATION", "DEGREE_TRANSLATION", "DEGREE_APOSTILLE"]);
  });
});
