import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fromISODate } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { ALL_PERMISSION_KEYS, OWNER_ONLY_KEYS } from "@/lib/permissions";
import { parseMoney } from "@/lib/money";
import { writeAudit } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { createCaseForStudent } from "@/server/cases";
import { evaluateAndPersist } from "@/server/case-engine";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDate = z.union([isoDate, z.literal("")]).optional().transform((v) => v || undefined);
const optText = (n = 300) => z.string().trim().max(n).optional().transform((v) => v || undefined);

// ───────────── Staff & permissions ─────────────

export async function createStaffAccount(actor: AuthUser, input: unknown) {
  await requirePermission(actor, "staff.manage");
  const d = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(10).max(128), role: z.enum(["STAFF", "ADMIN"]), title: optText(80) }).parse(input);
  if (d.role === "ADMIN" && actor.roleKey !== "OWNER") throw new ForbiddenError("Only the owner can create administrators");
  if (await db.user.findUnique({ where: { email: d.email } })) throw new ConflictError("An account with this e-mail already exists");
  const role = await db.role.findUniqueOrThrow({ where: { key: d.role } });
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: d.name, email: d.email, emailVerified: true, roleId: role.id } });
    await tx.account.create({ data: { accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(d.password) } });
    await tx.staffProfile.create({ data: { userId: u.id, title: d.title } });
    await writeAudit({ userId: actor.id, action: "staff.create", entity: "User", entityId: u.id, metadata: { role: d.role } }, tx);
    return u;
  });
  return user.id;
}

async function assertMayManage(actor: AuthUser, targetId: string) {
  await requirePermission(actor, "staff.manage");
  const target = await db.user.findUnique({ where: { id: targetId }, include: { role: true } });
  if (!target) throw new NotFoundError();
  // Staff cannot change the owner account; admins cannot touch owner or other admins without owner.manage
  if (target.role.key === "OWNER" && actor.roleKey !== "OWNER") throw new ForbiddenError("Only the owner can change the owner account");
  if (target.role.key === "ADMIN" && actor.roleKey !== "OWNER" && actor.id !== target.id) throw new ForbiddenError("Only the owner can change administrators");
  if (target.role.key === "STUDENT") throw new ValidationError("Not a staff account");
  return target;
}

export async function setUserActive(actor: AuthUser, userId: string, active: boolean) {
  const target = await assertMayManage(actor, userId);
  if (target.id === actor.id) throw new ValidationError("You cannot deactivate your own account");
  await db.user.update({ where: { id: userId }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId } });
  await writeAudit({ userId: actor.id, action: active ? "staff.activate" : "staff.deactivate", entity: "User", entityId: userId });
}

export type PermissionState = "inherit" | "grant" | "grant_all" | "revoke";

/** Per-user permission on top of the role: grant (assigned cases), grant for ALL cases, or revoke. Audited. */
export async function setUserPermission(actor: AuthUser, userId: string, key: string, state: PermissionState) {
  const target = await assertMayManage(actor, userId);
  if (!ALL_PERMISSION_KEYS.includes(key) || key.startsWith("self.")) throw new ValidationError("Unknown permission");
  if (OWNER_ONLY_KEYS.has(key) && actor.roleKey !== "OWNER") throw new ForbiddenError("Owner-only permission");
  if (target.role.key !== "STAFF") throw new ValidationError("Permissions are managed for staff accounts only");
  const perm = await db.permission.findUniqueOrThrow({ where: { key } });
  await db.$transaction(async (tx) => {
    if (state === "inherit") await tx.userPermission.deleteMany({ where: { userId, permissionId: perm.id } });
    else {
      const data = { granted: state !== "revoke", allCases: state === "grant_all" };
      await tx.userPermission.upsert({ where: { userId_permissionId: { userId, permissionId: perm.id } }, create: { userId, permissionId: perm.id, ...data }, update: data });
    }
    await writeAudit({ userId: actor.id, action: "permission.change", entity: "User", entityId: userId, metadata: { key, state } }, tx);
  });
}

// ───────────── Leads ─────────────

const leadSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: optText(30),
  email: z.union([z.string().trim().toLowerCase().pipe(z.email()), z.literal("")]).optional().transform((v) => v || undefined),
  preferredLocale: z.enum(["fr", "en", "ar", "it"]).default("fr"),
  intendedDegree: z.union([z.enum(["BACHELOR", "MASTER", "SINGLE_CYCLE", "PHD", "SPECIALIZATION"]), z.literal("")]).optional().transform((v) => v || undefined),
  intendedCityId: optText(64),
  source: z.enum(["INSTAGRAM", "FACEBOOK", "TIKTOK", "WHATSAPP", "REFERRAL", "WEBSITE", "WALK_IN", "OTHER"]).default("OTHER"),
  status: z.enum(["NEW", "CONTACTED", "CONSULTATION", "INTERESTED", "REGISTERED", "LOST", "CONVERTED"]).default("NEW"),
  assignedStaffId: optText(64),
  notes: optText(1000),
});

export async function saveLead(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "leads.write");
  const d = leadSchema.parse(input);
  const data = { ...d, intendedCityId: d.intendedCityId || null, assignedStaffId: d.assignedStaffId || null };
  const lead = id ? await db.lead.update({ where: { id }, data }) : await db.lead.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "lead.update" : "lead.create", entity: "Lead", entityId: lead.id });
  return lead.id;
}

/** Converting a lead creates the student account (with a one-time password) and the student's case. */
export async function convertLead(actor: AuthUser, leadId: string): Promise<{ email: string; password: string; caseId: string }> {
  await requirePermission(actor, "leads.write");
  await requirePermission(actor, "students.write");
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError();
  if (lead.convertedStudentId) throw new ConflictError("This lead was already converted");
  if (!lead.email) throw new ValidationError("The lead needs an e-mail address to create the student account");
  if (await db.user.findUnique({ where: { email: lead.email } })) throw new ConflictError("An account with this e-mail already exists");
  const password = randomBytes(9).toString("base64url") + "#7";
  const role = await db.role.findUniqueOrThrow({ where: { key: "STUDENT" } });
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: `${lead.firstName} ${lead.lastName}`, email: lead.email!, emailVerified: true, roleId: role.id, locale: lead.preferredLocale, phone: lead.phone } });
    await tx.account.create({ data: { accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(password) } });
    const student = await tx.student.create({ data: { userId: user.id, firstName: lead.firstName, lastName: lead.lastName, phone: lead.phone, desiredCityId: lead.intendedCityId, desiredDegreeLevel: lead.intendedDegree } });
    const assign = lead.assignedStaffId ? (await tx.staffProfile.findUnique({ where: { id: lead.assignedStaffId } }))?.userId : actor.roleKey === "STAFF" ? actor.id : undefined;
    const caseId = await createCaseForStudent(tx, student.id, { actorId: actor.id, assignStaffIds: assign ? [assign] : [] });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED", convertedStudentId: student.id } });
    await tx.consent.create({ data: { userId: user.id, type: "PRIVACY_POLICY", policyVersion: process.env.POLICY_VERSION ?? "2026-09" } });
    await writeAudit({ userId: actor.id, action: "lead.convert", entity: "Lead", entityId: lead.id, caseId, metadata: { studentId: student.id } }, tx);
    await evaluateAndPersist(caseId, { userId: actor.id, reason: "lead.convert" }, tx);
    return { caseId };
  });
  return { email: lead.email, password, caseId: result.caseId };
}

// ───────────── Universities, programs ─────────────

export async function saveUniversity(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "universities.manage");
  const d = z.object({ name: z.string().trim().min(2).max(160), cityId: z.string().min(1), website: optText(200), visaAppointmentDeadline: optDate, active: z.boolean().default(true) }).parse(input);
  const data = { name: d.name, cityId: d.cityId, website: d.website ?? null, visaAppointmentDeadline: d.visaAppointmentDeadline ? fromISODate(d.visaAppointmentDeadline) : null, active: d.active };
  const u = id ? await db.university.update({ where: { id }, data }) : await db.university.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "university.update" : "university.create", entity: "University", entityId: u.id });
  return u.id;
}

export async function saveProgram(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "universities.manage");
  const d = z
    .object({
      universityId: z.string().min(1),
      academicYearId: z.string().min(1),
      name: z.string().trim().min(2).max(160),
      degreeLevel: z.enum(["BACHELOR", "MASTER", "SINGLE_CYCLE", "PHD", "SPECIALIZATION"]),
      language: z.enum(["IT", "EN"]),
      durationMonths: z.coerce.number().int().min(1).max(120),
      applicationDeadline: optDate,
      visaAppointmentDeadline: optDate,
      applicationFee: optText(20),
      applicationFeeCurrency: z.enum(["EUR", "TND"]).optional(),
      active: z.boolean().default(true),
    })
    .parse(input);
  const fee = d.applicationFee ? parseMoney(d.applicationFee, d.applicationFeeCurrency ?? "EUR") : null;
  const data = {
    universityId: d.universityId,
    academicYearId: d.academicYearId,
    name: d.name,
    degreeLevel: d.degreeLevel,
    language: d.language,
    durationMonths: d.durationMonths,
    applicationDeadline: d.applicationDeadline ? fromISODate(d.applicationDeadline) : null,
    visaAppointmentDeadline: d.visaAppointmentDeadline ? fromISODate(d.visaAppointmentDeadline) : null,
    applicationFeeMinor: fee?.amountMinor ?? null,
    applicationFeeCurrency: fee?.currency ?? null,
    active: d.active,
  };
  const p = id ? await db.universityProgram.update({ where: { id }, data }) : await db.universityProgram.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "program.update" : "program.create", entity: "UniversityProgram", entityId: p.id });
  return p.id;
}

// ───────────── Scholarships ─────────────

export async function saveScholarship(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "scholarships.manage");
  const d = z.object({ name: z.string().trim().min(2).max(160), kind: z.enum(["ITALIAN_GOVERNMENT", "REGIONAL", "UNIVERSITY", "OTHER"]), regionId: optText(64), officialUrl: optText(300), active: z.boolean().default(true) }).parse(input);
  const data = { ...d, regionId: d.regionId || null, officialUrl: d.officialUrl ?? null };
  const s = id ? await db.scholarship.update({ where: { id }, data }) : await db.scholarship.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "scholarship.update" : "scholarship.create", entity: "Scholarship", entityId: s.id });
  return s.id;
}

export async function saveScholarshipVersion(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "scholarships.manage");
  const d = z
    .object({
      scholarshipId: z.string().min(1),
      academicYearId: z.string().min(1),
      eligibility: optText(600),
      openingDate: optText(30),
      deadline: optText(30),
      iseeMax: optText(20),
      ispeMax: optText(20),
      amount: optText(20),
      currency: z.enum(["EUR", "TND"]).default("EUR"),
      benefits: optText(600),
      sourceName: optText(200),
      sourceUrl: optText(300),
      notes: optText(600),
    })
    .parse(input);
  const money = (v?: string) => (v ? parseMoney(v, d.currency).amountMinor : null);
  const data = {
    scholarshipId: d.scholarshipId,
    academicYearId: d.academicYearId,
    eligibility: d.eligibility ?? null,
    // Values come from datetime-local inputs shown in UTC; store them as UTC instants.
    openingDate: d.openingDate ? new Date(d.openingDate.length === 16 ? `${d.openingDate}:00Z` : d.openingDate) : null,
    deadline: d.deadline ? new Date(d.deadline.length === 16 ? `${d.deadline}:00Z` : d.deadline) : null,
    iseeMaxMinor: money(d.iseeMax),
    ispeMaxMinor: money(d.ispeMax),
    thresholdCurrency: d.iseeMax || d.ispeMax ? d.currency : null,
    amountMinor: money(d.amount),
    amountCurrency: d.amount ? d.currency : null,
    benefits: d.benefits ? d.benefits.split("\n").map((s) => s.trim()).filter(Boolean) : undefined,
    sourceName: d.sourceName ?? null,
    sourceUrl: d.sourceUrl ?? null,
    dateVerified: new Date(),
    notes: d.notes ?? null,
  };
  const v = id ? await db.scholarshipVersion.update({ where: { id }, data }) : await db.scholarshipVersion.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "scholarship_version.update" : "scholarship_version.create", entity: "ScholarshipVersion", entityId: v.id });
  return v.id;
}

// ───────────── Payment plans ─────────────

export async function savePaymentPlan(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "payments.plans");
  const d = z.object({ name: z.string().trim().min(2).max(100), currency: z.enum(["TND", "EUR"]), isDefault: z.boolean().default(false), active: z.boolean().default(true) }).parse(input);
  const plan = await db.$transaction(async (tx) => {
    if (d.isDefault) await tx.paymentPlan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    if (id) {
      const existing = await tx.paymentPlan.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (existing.currency !== d.currency && existing.items.length) throw new ValidationError("Remove the items before changing the currency");
    }
    return id ? tx.paymentPlan.update({ where: { id }, data: d }) : tx.paymentPlan.create({ data: d });
  });
  await writeAudit({ userId: actor.id, action: id ? "payment_plan.update" : "payment_plan.create", entity: "PaymentPlan", entityId: plan.id });
  return plan.id;
}

export async function addPlanItem(actor: AuthUser, planId: string, input: unknown) {
  await requirePermission(actor, "payments.plans");
  const d = z.object({ name: z.string().trim().min(2).max(100), amount: z.string().trim().min(1).max(20), dueOffsetDays: z.coerce.number().int().min(0).max(1000).default(0) }).parse(input);
  const plan = await db.paymentPlan.findUniqueOrThrow({ where: { id: planId }, include: { items: true } });
  const amount = parseMoney(d.amount, plan.currency);
  if (amount.amountMinor <= 0) throw new ValidationError("Amount must be positive");
  const item = await db.paymentPlanItem.create({ data: { planId, name: d.name, amountMinor: amount.amountMinor, dueOffsetDays: d.dueOffsetDays, sortOrder: plan.items.length + 1 } });
  await writeAudit({ userId: actor.id, action: "payment_plan.item_add", entity: "PaymentPlanItem", entityId: item.id });
}

export async function removePlanItem(actor: AuthUser, itemId: string) {
  await requirePermission(actor, "payments.plans");
  // Plan items are templates: payments already generated for cases are separate rows and stay untouched.
  await db.paymentPlanItem.delete({ where: { id: itemId } });
  await writeAudit({ userId: actor.id, action: "payment_plan.item_remove", entity: "PaymentPlanItem", entityId: itemId });
}

// ───────────── Knowledge base, settings, stages, templates ─────────────

export async function saveArticle(actor: AuthUser, input: unknown, id?: string) {
  await requirePermission(actor, "knowledge_base.manage");
  const d = z.object({ title: z.string().trim().min(3).max(200), content: z.string().trim().min(3).max(20000), language: z.enum(["fr", "en", "ar", "it"]), category: z.string().trim().min(2).max(60), academicYearId: optText(64), source: optText(200), officialUrl: optText(300), lastVerified: optDate, published: z.boolean().default(false) }).parse(input);
  const data = { ...d, academicYearId: d.academicYearId || null, source: d.source ?? null, officialUrl: d.officialUrl ?? null, lastVerified: d.lastVerified ? fromISODate(d.lastVerified) : null };
  const a = id ? await db.knowledgeBaseArticle.update({ where: { id }, data } as Prisma.KnowledgeBaseArticleUpdateArgs) : await db.knowledgeBaseArticle.create({ data });
  await writeAudit({ userId: actor.id, action: id ? "article.update" : "article.create", entity: "KnowledgeBaseArticle", entityId: a.id });
  return a.id;
}

export async function saveSetting(actor: AuthUser, key: "agency.info" | "documents.retention", input: unknown) {
  await requirePermission(actor, "settings.manage");
  const value =
    key === "agency.info"
      ? z.object({ name: z.string().trim().min(2).max(100), country: z.string().trim().max(2), timezone: z.string().trim().max(60), supportEmail: z.string().trim().max(120), phone: optText(30), address: optText(200) }).parse(input)
      : z.object({ retentionMonths: z.coerce.number().int().min(12).max(240), note: optText(300) }).parse(input);
  await db.systemSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
  await writeAudit({ userId: actor.id, action: "settings.update", entity: "SystemSetting", entityId: key, metadata: value as never });
}

export async function saveStage(actor: AuthUser, id: string, input: unknown) {
  await requirePermission(actor, "settings.manage");
  const d = z.object({ name: z.string().trim().min(2).max(80), progressPercent: z.coerce.number().int().min(0).max(100), active: z.boolean().default(true) }).parse(input);
  const stage = await db.caseStage.findUniqueOrThrow({ where: { id } });
  const i18n = { ...((stage.nameI18n as Record<string, string> | null) ?? {}), en: d.name };
  await db.caseStage.update({ where: { id }, data: { name: d.name, nameI18n: i18n, progressPercent: d.progressPercent, active: d.active } });
  await writeAudit({ userId: actor.id, action: "case_stage.update", entity: "CaseStage", entityId: id });
}

export async function saveTemplate(actor: AuthUser, input: unknown) {
  await requirePermission(actor, "settings.manage");
  const d = z.object({ type: z.string().trim().min(2).max(60), locale: z.enum(["fr", "en", "ar", "it"]), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(2000) }).parse(input);
  await db.notificationTemplate.upsert({ where: { type_locale: { type: d.type, locale: d.locale } }, create: d, update: { title: d.title, body: d.body } });
  await writeAudit({ userId: actor.id, action: "notification_template.save", entity: "NotificationTemplate", entityId: `${d.type}:${d.locale}` });
}
