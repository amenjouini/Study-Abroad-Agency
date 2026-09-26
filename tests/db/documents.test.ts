import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ConflictError, ValidationError } from "../../src/lib/errors";
import { listVersionHistory, readDocumentVersion, reviewDocumentVersion, uploadDocumentVersion } from "../../src/server/documents";
import { saveSponsorStatus } from "../../src/server/student-data";
import { demoPdf } from "../../prisma/seed/demo-pdf";
import { authFor, caseOf, DB_AVAILABLE, instanceOf } from "../helpers/db";

const pdf = (label: string) => demoPdf(["TEST", label]);

describe.skipIf(!DB_AVAILABLE)("document versioning", () => {
  it("old versions remain accessible after replacement (passport v1 rejected, v2 approved)", async () => {
    const inst = await instanceOf("ahmed@student.test", "PASSPORT_COPY");
    const versions = inst.documents[0].versions;
    expect(versions.map((v) => [v.versionNumber, v.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "APPROVED"],
    ]);
    // v1 keeps its rejection reason and reviewer
    expect(versions[0].rejectionReason).toContain("blurry");
    expect(versions[0].reviewerId).toBeTruthy();

    const staff = await authFor("staff@agency.test");
    const history = await listVersionHistory(staff, inst.id);
    expect(history.map((v) => v.versionNumber)).toEqual([2, 1]);
    // every version's file is still readable
    for (const v of versions) {
      const file = await readDocumentVersion(staff, v.id);
      expect(file.body.length).toBeGreaterThan(100);
    }
    // the review trail of v1 is intact: the REJECT decision is still recorded
    const v1Reviews = history.find((v) => v.versionNumber === 1)!.reviews;
    expect(v1Reviews.map((r) => r.decision)).toContain("REJECT");
  });

  it("uploading a new version supersedes the previous one without deleting it", async () => {
    const ines = await authFor("ines@student.test");
    const inst = await instanceOf("ines@student.test", "PASSPORT_PHOTO");
    const first = await uploadDocumentVersion(ines, { instanceId: inst.id, buffer: pdf("one"), filename: "photo.pdf" });
    const second = await uploadDocumentVersion(ines, { instanceId: inst.id, buffer: pdf("two"), filename: "photo.pdf" });
    expect(second.versionNumber).toBe(first.versionNumber + 1);
    const rows = await db.documentVersion.findMany({ where: { document: { instanceId: inst.id } }, orderBy: { versionNumber: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("SUPERSEDED");
    expect(rows[0].supersededAt).not.toBeNull();
    expect(rows[1].status).toBe("UPLOADED");
    expect((await instanceOf("ines@student.test", "PASSPORT_PHOTO")).status).toBe("UPLOADED");
  });

  it("validates uploads: content sniffing, extension and size", async () => {
    const mehdi = await authFor("mehdi@student.test");
    const inst = await instanceOf("mehdi@student.test", "PASSPORT_PHOTO");
    const fake = Buffer.from("MZ\u0090\u0000this is really an executable");
    await expect(uploadDocumentVersion(mehdi, { instanceId: inst.id, buffer: fake, filename: "photo.pdf" })).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadDocumentVersion(mehdi, { instanceId: inst.id, buffer: pdf("x"), filename: "photo.exe" })).rejects.toBeInstanceOf(ValidationError);
    // a PDF renamed to .png does not match its extension
    await expect(uploadDocumentVersion(mehdi, { instanceId: inst.id, buffer: pdf("x"), filename: "photo.png" })).rejects.toBeInstanceOf(ValidationError);
    const big = Buffer.concat([pdf("big"), Buffer.alloc(11 * 1024 * 1024)]);
    await expect(uploadDocumentVersion(mehdi, { instanceId: inst.id, buffer: big, filename: "big.pdf" })).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadDocumentVersion(mehdi, { instanceId: inst.id, buffer: Buffer.alloc(0), filename: "empty.pdf" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejecting requires a reason; approving needs the required formalities", async () => {
    const ines = await authFor("ines@student.test");
    const staff = await authFor("staff@agency.test");
    const inst = await instanceOf("ines@student.test", "BANK_BLOCKING_LETTER");
    expect(inst.requirement.requiredFormalities).toEqual(expect.arrayContaining(["originalPresented", "signed", "stamped"]));
    const { versionId } = await uploadDocumentVersion(ines, { instanceId: inst.id, buffer: pdf("blocking"), filename: "blocking.pdf" });

    await expect(reviewDocumentVersion(staff, { versionId, decision: "REJECT" })).rejects.toBeInstanceOf(ValidationError);
    await expect(reviewDocumentVersion(staff, { versionId, decision: "APPROVE", formalities: { originalPresented: true } })).rejects.toBeInstanceOf(ValidationError);
    await reviewDocumentVersion(staff, { versionId, decision: "APPROVE", formalities: { originalPresented: true, signed: true, stamped: true } });
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(v).toMatchObject({ status: "APPROVED", originalPresented: true, signed: true, stamped: true, translated: false, approved: true });
  });

  it("a dependent requirement cannot be approved before its prerequisite", async () => {
    // Ahmed: DEGREE_TRANSLATION is only uploaded, so DEGREE_APOSTILLE (which depends on it) cannot be approved
    const ahmed = await authFor("ahmed@student.test");
    const staff = await authFor("staff@agency.test");
    const apostille = await instanceOf("ahmed@student.test", "DEGREE_APOSTILLE");
    const { versionId } = await uploadDocumentVersion(ahmed, { instanceId: apostille.id, buffer: pdf("apostille"), filename: "apostille.pdf" });
    await expect(reviewDocumentVersion(staff, { versionId, decision: "APPROVE", formalities: { apostilled: true } })).rejects.toBeInstanceOf(ConflictError);

    // Once the translation is approved, the apostille can be approved
    const translation = await instanceOf("ahmed@student.test", "DEGREE_TRANSLATION");
    const tv = translation.documents[0].versions.at(-1)!;
    await reviewDocumentVersion(staff, { versionId: tv.id, decision: "APPROVE", formalities: { translated: true } });
    await reviewDocumentVersion(staff, { versionId, decision: "APPROVE", formalities: { apostilled: true } });
    expect((await instanceOf("ahmed@student.test", "DEGREE_APOSTILLE")).status).toBe("APPROVED");
  });

  it("students never see internal comments", async () => {
    const staff = await authFor("staff@agency.test");
    const ahmed = await authFor("ahmed@student.test");
    const inst = await instanceOf("ahmed@student.test", "PASSPORT_COPY");
    const v = inst.documents[0].versions.at(-1)!;
    await reviewDocumentVersion(staff, { versionId: v.id, decision: "COMMENT", comment: "internal: check MRZ manually", internal: true });
    await reviewDocumentVersion(staff, { versionId: v.id, decision: "COMMENT", comment: "Looks good, thanks", internal: false });
    const asStaff = (await listVersionHistory(staff, inst.id)).flatMap((x) => x.reviews.map((r) => r.comment));
    const asStudent = (await listVersionHistory(ahmed, inst.id)).flatMap((x) => x.reviews.map((r) => r.comment));
    expect(asStaff).toContain("internal: check MRZ manually");
    expect(asStudent).not.toContain("internal: check MRZ manually");
    expect(asStudent).toContain("Looks good, thanks");
  });
});

describe.skipIf(!DB_AVAILABLE)("re-evaluation when facts change", () => {
  it("dropped requirements become NOT_APPLICABLE, keep their documents, and come back when the facts return", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("ahmed@student.test");
    const father = await db.sponsor.findFirstOrThrow({ where: { caseId: c.id } });

    const payslips = await instanceOf("ahmed@student.test", "PAYSLIPS_LAST_6", father.id);
    const versionsBefore = payslips.documents[0].versions.length;
    expect(payslips.status).toBe("UPLOADED");

    // Father switches from EMPLOYEE to RETIRED (CNSS)
    await saveSponsorStatus(staff, { sponsorId: father.id, professionalStatus: "RETIRED", pensionFund: "CNSS" }, c.id);
    const dropped = await instanceOf("ahmed@student.test", "PAYSLIPS_LAST_6", father.id);
    expect(dropped.status).toBe("NOT_APPLICABLE");
    expect(dropped.previousStatus).toBe("UPLOADED");
    expect(dropped.documents[0].versions).toHaveLength(versionsBefore); // documents untouched
    const retirement = await instanceOf("ahmed@student.test", "RETIREMENT_CERTIFICATE", father.id);
    expect(retirement.status).toBe("NOT_STARTED");
    const cnss = await instanceOf("ahmed@student.test", "PENSION_DOCS_CNSS", father.id);
    expect(cnss.status).toBe("NOT_STARTED");

    // recorded in the audit log and on the case timeline
    const audits = await db.auditLog.findMany({ where: { caseId: c.id, action: "engine.reevaluate" }, orderBy: { createdAt: "desc" }, take: 1 });
    expect(audits[0].metadata).toMatchObject({ reason: "sponsor.status", markedNotApplicable: expect.any(Number) });
    const timeline = await db.timelineEntry.findFirst({ where: { caseId: c.id, type: "checklist.updated" }, orderBy: { createdAt: "desc" } });
    expect(timeline).not.toBeNull();

    // Back to EMPLOYEE: the payslips requirement returns with its previous status and document
    await saveSponsorStatus(staff, { sponsorId: father.id, professionalStatus: "EMPLOYEE" }, c.id);
    const back = await instanceOf("ahmed@student.test", "PAYSLIPS_LAST_6", father.id);
    expect(back.status).toBe("UPLOADED");
    expect(back.documents[0].versions).toHaveLength(versionsBefore);
    expect((await instanceOf("ahmed@student.test", "RETIREMENT_CERTIFICATE", father.id)).status).toBe("NOT_APPLICABLE");
  });

  it("a retired sponsor without a stated pension fund is rejected at input (never assumed)", async () => {
    const staff = await authFor("staff@agency.test");
    const c = await caseOf("ahmed@student.test");
    const father = await db.sponsor.findFirstOrThrow({ where: { caseId: c.id } });
    await expect(saveSponsorStatus(staff, { sponsorId: father.id, professionalStatus: "RETIRED" }, c.id)).rejects.toThrow();
  });
});
