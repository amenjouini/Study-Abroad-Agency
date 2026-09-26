import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/lib/errors";
import { convertLead, createStaffAccount, saveLead, savePaymentPlan, addPlanItem, setUserPermission, saveProgram } from "../../src/server/admin";
import { hasPermission } from "../../src/server/authz";
import { evaluateAndPersist } from "../../src/server/case-engine";
import { addDependency, cloneVersion, migrateCase, previewMigration, saveDeadline, saveParameter, saveRuleTree, setVersionStatus } from "../../src/server/procedures";
import { authFor, caseOf, DB_AVAILABLE } from "../helpers/db";

describe.skipIf(!DB_AVAILABLE)("staff and permission management", () => {
  it("only staff.manage holders can create accounts; only the owner can create administrators", async () => {
    const staff = await authFor("staff@agency.test");
    const admin = await authFor("admin@agency.test");
    const owner = await authFor("owner@agency.test");
    const input = { name: "New Advisor", email: "advisor@agency.test", password: "Advisor#2026-dev", role: "STAFF" };
    await expect(createStaffAccount(staff, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createStaffAccount(admin, { ...input, role: "ADMIN" })).rejects.toBeInstanceOf(ForbiddenError);
    const id = await createStaffAccount(admin, input);
    const created = await db.user.findUniqueOrThrow({ where: { id }, include: { role: true, accounts: true, staffProfile: true } });
    expect(created.role.key).toBe("STAFF");
    expect(created.accounts[0].password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // salted hash, never the password
    expect(created.staffProfile).not.toBeNull();
    await expect(createStaffAccount(admin, input)).rejects.toBeInstanceOf(ConflictError);
    await createStaffAccount(owner, { ...input, email: "admin2@agency.test", role: "ADMIN" });
  });

  it("per-user permissions can be granted (assigned cases or all cases) or revoked, and every change is audited", async () => {
    const admin = await authFor("admin@agency.test");
    const staff2 = await authFor("staff2@agency.test");
    const c = await caseOf("ahmed@student.test");
    expect(await hasPermission(staff2, "payments.write")).toBe(false);
    await setUserPermission(admin, staff2.id, "payments.write", "grant");
    expect(await hasPermission(staff2, "payments.write")).toBe(true);
    expect(await hasPermission(staff2, "payments.write", { caseId: c.id })).toBe(false); // not assigned
    await setUserPermission(admin, staff2.id, "payments.write", "grant_all");
    expect(await hasPermission(staff2, "payments.write", { caseId: c.id })).toBe(true);
    await setUserPermission(admin, staff2.id, "payments.write", "revoke");
    expect(await hasPermission(staff2, "payments.write")).toBe(false);
    await setUserPermission(admin, staff2.id, "payments.write", "inherit");
    expect(await db.auditLog.count({ where: { action: "permission.change", entityId: staff2.id } })).toBe(4);
  });

  it("nobody but the owner can grant owner-only permissions or change the owner account", async () => {
    const admin = await authFor("admin@agency.test");
    const staff = await authFor("staff@agency.test");
    const owner = await authFor("owner@agency.test");
    await expect(setUserPermission(admin, staff.id, "owner.manage", "grant")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserPermission(admin, owner.id, "audit.view", "revoke")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserPermission(staff, staff.id, "staff.manage", "grant")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!DB_AVAILABLE)("leads", () => {
  it("converting a lead creates a student account and a case with an engine-generated checklist", async () => {
    const admin = await authFor("admin@agency.test");
    const staff = await authFor("staff@agency.test");
    const leadId = await saveLead(admin, { firstName: "Lina", lastName: "Test", email: "lina.lead@example.com", phone: "+216 20 555 000", source: "INSTAGRAM", status: "INTERESTED", preferredLocale: "fr" });
    await expect(convertLead(staff, leadId)).rejects.toBeInstanceOf(ForbiddenError); // staff lack leads.write
    const res = await convertLead(admin, leadId);
    expect(res.password.length).toBeGreaterThanOrEqual(10);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("CONVERTED");
    const student = await db.student.findUniqueOrThrow({ where: { id: lead.convertedStudentId! }, include: { user: { include: { role: true } } } });
    expect(student.user.role.key).toBe("STUDENT");
    expect(await db.documentRequirementInstance.count({ where: { caseId: res.caseId } })).toBeGreaterThan(0);
    await expect(convertLead(admin, leadId)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe.skipIf(!DB_AVAILABLE)("catalogue and payment plans", () => {
  it("payment plan amounts use the currency's own decimals and reject a wrong number of decimals", async () => {
    const admin = await authFor("admin@agency.test");
    const planId = await savePaymentPlan(admin, { name: "Test plan", currency: "TND", isDefault: false, active: true });
    await addPlanItem(admin, planId, { name: "First", amount: "250.500", dueOffsetDays: 5 });
    const item = await db.paymentPlanItem.findFirstOrThrow({ where: { planId } });
    expect(item.amountMinor).toBe(250_500);
    await expect(addPlanItem(admin, planId, { name: "Bad", amount: "10.1234" })).rejects.toThrow();
    await expect(addPlanItem(admin, planId, { name: "Zero", amount: "0" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("programs store the application fee as minor units + currency", async () => {
    const admin = await authFor("admin@agency.test");
    const staff = await authFor("staff@agency.test");
    const base = await db.universityProgram.findFirstOrThrow({ where: { name: "Economics (MSc)" } });
    const id = await saveProgram(admin, { universityId: base.universityId, academicYearId: base.academicYearId, name: "Test program", degreeLevel: "MASTER", language: "EN", durationMonths: "6", applicationFee: "75.50", applicationFeeCurrency: "EUR", active: true });
    expect(await db.universityProgram.findUniqueOrThrow({ where: { id } })).toMatchObject({ applicationFeeMinor: 7550, applicationFeeCurrency: "EUR", durationMonths: 6 });
    await expect(saveProgram(staff, { universityId: base.universityId, academicYearId: base.academicYearId, name: "x", degreeLevel: "MASTER", language: "EN", durationMonths: "6" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.skipIf(!DB_AVAILABLE)("procedure management: versions, rules, migration", () => {
  it("cloning creates an independent DRAFT copy that changes no existing case", async () => {
    const admin = await authFor("admin@agency.test");
    const active = await db.procedureVersion.findFirstOrThrow({ where: { status: "ACTIVE" }, include: { _count: { select: { requirements: true, deadlines: true, parameters: true } } } });
    const deps = await db.requirementDependency.count({ where: { requirement: { procedureVersionId: active.id } } });
    const year = await db.academicYear.findUniqueOrThrow({ where: { label: "2027/28" } });
    const cloneId = await cloneVersion(admin, active.id, year.id);
    const clone = await db.procedureVersion.findUniqueOrThrow({ where: { id: cloneId }, include: { _count: { select: { requirements: true, deadlines: true, parameters: true } } } });
    expect(clone.status).toBe("DRAFT");
    expect(clone.versionNumber).toBe(2); // 2027/28 already has v1
    expect(clone._count).toEqual(active._count);
    expect(await db.requirementDependency.count({ where: { requirement: { procedureVersionId: cloneId } } })).toBe(deps);
    // rule trees were copied, not shared
    const src = await db.procedureRequirement.findFirstOrThrow({ where: { procedureVersionId: active.id, code: "BANK_BLOCKING_LETTER" } });
    const dst = await db.procedureRequirement.findFirstOrThrow({ where: { procedureVersionId: cloneId, code: "BANK_BLOCKING_LETTER" } });
    expect(dst.ruleGroupId).not.toBe(src.ruleGroupId);
    expect(await db.case.count({ where: { procedureVersionId: cloneId } })).toBe(0);
  });

  it("rules are validated and saving a tree changes what the engine requires", async () => {
    const admin = await authFor("admin@agency.test");
    const staff = await authFor("staff@agency.test");
    const year = await db.academicYear.findUniqueOrThrow({ where: { label: "2027/28" } });
    const active = await db.procedureVersion.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const draftId = await cloneVersion(admin, active.id, year.id);
    const req = await db.procedureRequirement.findFirstOrThrow({ where: { procedureVersionId: draftId, code: "MOTIVATION_LETTER" } });

    await expect(saveRuleTree(staff, req.id, null)).rejects.toBeInstanceOf(ForbiddenError);
    // invalid: "in" without a list, unknown operator
    await expect(saveRuleTree(admin, req.id, { type: "group", operator: "AND", children: [{ type: "condition", field: "student.desiredDegreeLevel", operator: "in", value: "MASTER" }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveRuleTree(admin, req.id, { type: "condition", field: "x", operator: "contains", value: "a" })).rejects.toThrow();
    await expect(saveRuleTree(admin, req.id, { type: "condition", field: "student.x", operator: "between", value: [1] })).rejects.toBeInstanceOf(ValidationError);

    // valid: motivation letter only for PHD students
    await saveRuleTree(admin, req.id, { type: "group", operator: "AND", children: [{ type: "condition", field: "student.desiredDegreeLevel", operator: "equals", value: "PHD" }] });
    const conds = await db.procedureRuleCondition.findMany({ where: { group: { procedureVersionId: draftId, requirement: { id: req.id } } } });
    expect(conds).toHaveLength(1);
    expect(conds[0].operator).toBe("equals");
  });

  it("dependency cycles are refused", async () => {
    const admin = await authFor("admin@agency.test");
    const active = await db.procedureVersion.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const year = await db.academicYear.findUniqueOrThrow({ where: { label: "2027/28" } });
    const draft = await cloneVersion(admin, active.id, year.id);
    const get = (code: string) => db.procedureRequirement.findFirstOrThrow({ where: { procedureVersionId: draft, code } });
    const [diploma, value] = [await get("DEGREE_DIPLOMA"), await get("DEGREE_VALUE_DECLARATION")];
    await expect(addDependency(admin, diploma.id, value.id)).rejects.toBeInstanceOf(ValidationError); // diploma → … → value → diploma
    await expect(addDependency(admin, diploma.id, diploma.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("deadlines and parameters are validated; activating a version archives the previous active one", async () => {
    const admin = await authFor("admin@agency.test");
    const active = await db.procedureVersion.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const draft = await cloneVersion(admin, active.id, active.academicYearId); // same year → competing version
    await saveDeadline(admin, draft, { code: "TEST_DEADLINE", name: "Test", kind: "OFFSET", offsetBasis: "visa.arrivalDate", offsetDays: "5", dayType: "WORKING_DAYS", holidayCountryCode: "IT", reminderDays: "7, 1", priority: "HIGH" });
    expect((await db.procedureDeadline.findFirstOrThrow({ where: { procedureVersionId: draft, code: "TEST_DEADLINE" } })).reminderDays).toEqual([7, 1]);
    await expect(saveDeadline(admin, draft, { code: "BAD", name: "Bad", kind: "FIXED_DATE" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveParameter(admin, draft, "financial.published_minimum_total", "not json")).rejects.toBeInstanceOf(ValidationError);
    await expect(saveParameter(admin, draft, "financial.published_minimum_total", JSON.stringify({ amountMinor: 1.5, currency: "EUR" }))).rejects.toBeInstanceOf(ValidationError);
    await saveParameter(admin, draft, "financial.published_minimum_total", JSON.stringify({ amountMinor: 1_100_000, currency: "EUR" }));

    await setVersionStatus(admin, draft, "ACTIVE");
    expect((await db.procedureVersion.findUniqueOrThrow({ where: { id: draft } })).status).toBe("ACTIVE");
    expect((await db.procedureVersion.findUniqueOrThrow({ where: { id: active.id } })).status).toBe("ARCHIVED");
    // archived versions are read-only
    await expect(saveDeadline(admin, active.id, { code: "X_Y", name: "x", kind: "FIXED_DATE", fixedDate: "2027-01-01" })).rejects.toBeInstanceOf(ConflictError);
    // restore for the other tests in this file
    await setVersionStatus(admin, active.id, "ACTIVE");
  });

  it("migrating a case is explicit: preview the diff, then confirm; documents stay attached", async () => {
    const admin = await authFor("admin@agency.test");
    const staff = await authFor("staff@agency.test");
    const active = await db.procedureVersion.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const draft = await cloneVersion(admin, active.id, active.academicYearId);
    // The new version drops the motivation letter and requires a new document
    const motivation = await db.procedureRequirement.findFirstOrThrow({ where: { procedureVersionId: draft, code: "MOTIVATION_LETTER" } });
    await saveRuleTree(admin, motivation.id, { type: "group", operator: "AND", children: [{ type: "condition", field: "student.desiredDegreeLevel", operator: "equals", value: "PHD" }] });

    const c = await caseOf("ines@student.test");
    const diff = await previewMigration(admin, c.id, draft);
    expect(diff.removed.map((r) => r.code)).toContain("MOTIVATION_LETTER");
    expect(diff.added).toEqual([]);
    expect(diff.unchanged).toBeGreaterThan(10);
    await expect(previewMigration(staff, c.id, draft)).rejects.toBeInstanceOf(ForbiddenError);

    const before = await db.documentVersion.count({ where: { document: { caseId: c.id } } });
    await migrateCase(admin, c.id, draft);
    const after = await db.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.procedureVersionId).toBe(draft);
    const letter = await db.documentRequirementInstance.findFirstOrThrow({ where: { caseId: c.id, requirement: { code: "MOTIVATION_LETTER" } } });
    expect(letter.status).toBe("NOT_APPLICABLE");
    expect(await db.documentVersion.count({ where: { document: { caseId: c.id } } })).toBe(before);
    expect(await db.auditLog.count({ where: { caseId: c.id, action: "case.procedure_migrate" } })).toBe(1);
    await expect(migrateCase(admin, c.id, draft)).rejects.toBeInstanceOf(ConflictError);
    // re-evaluation still works on the migrated case
    await evaluateAndPersist(c.id, { userId: admin.id, reason: "test" });
  });
});
