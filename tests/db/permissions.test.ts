import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ForbiddenError } from "../../src/lib/errors";
import { caseAccessWhere, hasPermission, requirePermission } from "../../src/server/authz";
import { listVersionHistory, readDocumentVersion, reviewDocumentVersion, uploadDocumentVersion } from "../../src/server/documents";
import { savePersonal } from "../../src/server/student-data";
import { authFor, caseOf, DB_AVAILABLE, instanceOf } from "../helpers/db";

describe.skipIf(!DB_AVAILABLE)("authorization (server-side)", () => {
  it("a student cannot read another student's documents", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const sarraPassport = await instanceOf("sarra@student.test", "PASSPORT_COPY");
    const version = sarraPassport.documents[0].versions[0];

    await expect(readDocumentVersion(ahmed, version.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listVersionHistory(ahmed, sarraPassport.id)).rejects.toBeInstanceOf(ForbiddenError);
    // ...but Sarra can read her own
    const sarra = await authFor("sarra@student.test");
    const file = await readDocumentVersion(sarra, version.id);
    expect(file.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("a student cannot upload to, or review, another student's requirement", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const other = await instanceOf("sarra@student.test", "PASSPORT_PHOTO");
    const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
    await expect(uploadDocumentVersion(ahmed, { instanceId: other.id, buffer: pdf, filename: "x.pdf" })).rejects.toBeInstanceOf(ForbiddenError);
    const v = (await instanceOf("ahmed@student.test", "PASSPORT_COPY")).documents[0].versions[0];
    await expect(reviewDocumentVersion(ahmed, { versionId: v.id, decision: "APPROVE" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("staff2 cannot access staff@'s cases", async () => {
    const staff2 = await authFor("staff2@agency.test");
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("ahmed@student.test");
    const version = (await instanceOf("ahmed@student.test", "PASSPORT_COPY")).documents[0].versions[0];

    expect(await hasPermission(staff, "documents.read", { caseId: c.id })).toBe(true);
    expect(await hasPermission(staff2, "documents.read", { caseId: c.id })).toBe(false);
    await expect(requirePermission(staff2, "documents.review", { caseId: c.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readDocumentVersion(staff2, version.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reviewDocumentVersion(staff2, { versionId: version.id, decision: "COMMENT", comment: "hi" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      savePersonal(staff2, { firstName: "X", lastName: "Y", phone: "+21600000000", dateOfBirth: "2000-01-01", passportNumber: "TN0000000", passportExpiry: "2030-01-01" }, c.id),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // list queries are scoped as well
    expect(await db.case.count({ where: await caseAccessWhere(staff2, "students.read") })).toBe(0);
    expect(await db.case.count({ where: await caseAccessWhere(staff, "students.read") })).toBe(5);
  });

  it("staff can be granted wider access for one permission (all cases)", async () => {
    const staff2 = await authFor("staff2@agency.test");
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "documents.read" } });
    await db.userPermission.create({ data: { userId: staff2.id, permissionId: perm.id, granted: true, allCases: true } });
    const c = await caseOf("ahmed@student.test");
    expect(await hasPermission(staff2, "documents.read", { caseId: c.id })).toBe(true);
    // the grant is for that permission only
    expect(await hasPermission(staff2, "documents.review", { caseId: c.id })).toBe(false);
    await db.userPermission.delete({ where: { userId_permissionId: { userId: staff2.id, permissionId: perm.id } } });
  });

  it("a revoked permission is denied even when the role has it", async () => {
    const staff2 = await authFor("staff2@agency.test");
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "messages.read" } });
    expect(await hasPermission(staff2, "messages.read")).toBe(true);
    await db.userPermission.create({ data: { userId: staff2.id, permissionId: perm.id, granted: false } });
    expect(await hasPermission(staff2, "messages.read")).toBe(false);
    await db.userPermission.delete({ where: { userId_permissionId: { userId: staff2.id, permissionId: perm.id } } });
  });

  it("staff cannot use critical permissions by default; admin can access everything", async () => {
    const staff = await authFor("staff@agency.test");
    const admin = await authFor("admin@agency.test");
    for (const key of ["procedures.manage", "document_rules.manage", "settings.manage", "staff.manage", "audit.view"]) {
      expect(await hasPermission(staff, key)).toBe(false);
      expect(await hasPermission(admin, key)).toBe(true);
    }
    for (const name of ["ahmed", "sarra", "youssef", "ines", "mehdi"]) {
      const c = await caseOf(`${name}@student.test`);
      expect(await hasPermission(admin, "documents.review", { caseId: c.id })).toBe(true);
    }
    expect(await db.case.count({ where: await caseAccessWhere(admin, "students.read") })).toBe(await db.case.count());
  });

  it("only the owner holds owner.manage", async () => {
    const admin = await authFor("admin@agency.test");
    const owner = await authFor("owner@agency.test");
    expect(await hasPermission(admin, "owner.manage")).toBe(false);
    expect(await hasPermission(owner, "owner.manage")).toBe(true);
  });

  it("students hold no staff permissions, whatever grants exist", async () => {
    const ahmed = await authFor("ahmed@student.test");
    const perm = await db.permission.findUniqueOrThrow({ where: { key: "documents.review" } });
    await db.userPermission.create({ data: { userId: ahmed.id, permissionId: perm.id, granted: true, allCases: true } });
    const c = await caseOf("sarra@student.test");
    expect(await hasPermission(ahmed, "documents.review", { caseId: c.id })).toBe(false);
    await db.userPermission.delete({ where: { userId_permissionId: { userId: ahmed.id, permissionId: perm.id } } });
  });

  it("inactive accounts lose all access", async () => {
    const staff2 = await authFor("staff2@agency.test");
    await db.user.update({ where: { id: staff2.id }, data: { active: false } });
    expect(await hasPermission(staff2, "students.read")).toBe(false);
    await db.user.update({ where: { id: staff2.id }, data: { active: true } });
  });
});
