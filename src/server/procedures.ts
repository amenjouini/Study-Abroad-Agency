import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { fromISODate } from "@/lib/dates";
import { hasDependencyCycle } from "@/lib/engine/dependencies";
import { evaluateCase } from "@/lib/engine/evaluate";
import type { RuleNode } from "@/lib/engine/types";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { evaluateAndPersist } from "@/server/case-engine";
import { loadCaseFacts } from "@/server/facts-loader";
import { loadProcedureDefinition } from "@/server/procedure-loader";

const OPERATORS = ["equals", "not_equals", "in", "not_in", "gt", "gte", "lt", "lte", "between", "before", "after", "exists", "not_exists"] as const;

export const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("condition"), field: z.string().trim().min(1).max(120).regex(/^[A-Za-z][\w.]*$/), operator: z.enum(OPERATORS), value: z.unknown().optional() }),
    z.object({ type: z.literal("group"), operator: z.enum(["AND", "OR", "NOT"]), children: z.array(ruleNodeSchema).max(50) }),
  ]),
) as z.ZodType<RuleNode>;

/** Operators that need a list / pair / no value are validated here, so a saved rule can never crash the engine. */
function validateTree(node: RuleNode, depth = 0): void {
  if (depth > 6) throw new ValidationError("Rule tree is nested too deeply");
  if (node.type === "group") {
    node.children.forEach((c) => validateTree(c, depth + 1));
    return;
  }
  const needsList = node.operator === "in" || node.operator === "not_in";
  const needsPair = node.operator === "between";
  const needsNone = node.operator === "exists" || node.operator === "not_exists";
  const isRef = node.value && typeof node.value === "object" && !Array.isArray(node.value) && ("$param" in (node.value as object) || "$field" in (node.value as object));
  if (needsList && !Array.isArray(node.value) && !isRef) throw new ValidationError(`"${node.operator}" on ${node.field} needs a list of values`);
  if (needsPair && !(Array.isArray(node.value) && node.value.length === 2)) throw new ValidationError(`"between" on ${node.field} needs exactly two values`);
  if (!needsNone && !needsList && !needsPair && (node.value === undefined || node.value === "")) throw new ValidationError(`"${node.operator}" on ${node.field} needs a value`);
}

async function editableVersion(versionId: string, client: Tx | typeof db = db) {
  const v = await client.procedureVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new NotFoundError("Procedure version not found");
  if (v.status === "ARCHIVED") throw new ConflictError("Archived versions are read-only");
  return v;
}

async function insertTree(tx: Tx, versionId: string, node: RuleNode, parentId: string | null, sortOrder: number): Promise<string> {
  const root: RuleNode = node.type === "condition" ? { type: "group", operator: "AND", children: [node] } : node;
  if (root.type !== "group") throw new Error("unreachable");
  const group = await tx.procedureRuleGroup.create({ data: { procedureVersionId: versionId, parentId, operator: root.operator, sortOrder } });
  let ci = 0;
  let gi = 0;
  for (const child of root.children) {
    if (child.type === "condition") {
      const v = child.value;
      const valueType = v && typeof v === "object" && !Array.isArray(v) ? "CALCULATED" : typeof v === "boolean" ? "BOOLEAN" : typeof v === "number" ? "NUMBER" : "STRING";
      await tx.procedureRuleCondition.create({ data: { groupId: group.id, sortOrder: ci++, field: child.field, operator: child.operator, valueType, value: v === undefined ? undefined : (v as Prisma.InputJsonValue) } });
    } else {
      await insertTree(tx, versionId, child, group.id, gi++);
    }
  }
  return group.id;
}

/** Replace the applicability rule (condition tree) of a requirement. null = always applicable. */
export async function saveRuleTree(actor: AuthUser, requirementId: string, tree: unknown) {
  await requirePermission(actor, "document_rules.manage");
  const req = await db.procedureRequirement.findUnique({ where: { id: requirementId } });
  if (!req) throw new NotFoundError();
  await editableVersion(req.procedureVersionId);
  const parsed = tree === null ? null : ruleNodeSchema.parse(tree);
  if (parsed) validateTree(parsed);
  await db.$transaction(async (tx) => {
    const oldRoot = req.ruleGroupId;
    let newRoot: string | null = null;
    if (parsed) newRoot = await insertTree(tx, req.procedureVersionId, parsed, null, 0);
    await tx.procedureRequirement.update({ where: { id: requirementId }, data: { ruleGroupId: newRoot } });
    if (oldRoot) await tx.procedureRuleGroup.delete({ where: { id: oldRoot } });
    await writeAudit({ userId: actor.id, action: "procedure.rule_update", entity: "ProcedureRequirement", entityId: requirementId, metadata: { code: req.code, versionId: req.procedureVersionId } }, tx);
  });
}

const requirementSchema = z.object({
  name: z.string().trim().min(2).max(160),
  nameFr: z.string().trim().max(160).optional(),
  nameIt: z.string().trim().max(160).optional(),
  nameAr: z.string().trim().max(160).optional(),
  whyEn: z.string().trim().max(600).optional(),
  whyFr: z.string().trim().max(600).optional(),
  mandatory: z.boolean().default(true),
  requiredFormalities: z.array(z.enum(["originalPresented", "signed", "stamped", "translated", "legalized", "apostilled"])).default([]),
  deadlineCode: z.string().trim().max(60).optional(),
  reviewReason: z.string().trim().max(400).optional(),
  reviewPriority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  sourceUrl: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(600).optional(),
});

export async function updateRequirement(actor: AuthUser, requirementId: string, input: unknown) {
  await requirePermission(actor, "document_rules.manage");
  const d = requirementSchema.parse(input);
  const req = await db.procedureRequirement.findUnique({ where: { id: requirementId } });
  if (!req) throw new NotFoundError();
  await editableVersion(req.procedureVersionId);
  const i18n = { ...((req.nameI18n as Record<string, string> | null) ?? {}), en: d.name, ...(d.nameFr ? { fr: d.nameFr } : {}), ...(d.nameIt ? { it: d.nameIt } : {}), ...(d.nameAr ? { ar: d.nameAr } : {}) };
  const why = { ...((req.whyI18n as Record<string, string> | null) ?? {}), ...(d.whyEn ? { en: d.whyEn } : {}), ...(d.whyFr ? { fr: d.whyFr } : {}) };
  await db.procedureRequirement.update({
    where: { id: requirementId },
    data: {
      name: d.name,
      nameI18n: i18n,
      whyI18n: why,
      description: d.whyEn ?? req.description,
      mandatory: d.mandatory,
      requiredFormalities: d.requiredFormalities,
      deadlineCode: d.deadlineCode || null,
      reviewReason: d.reviewReason || null,
      reviewPriority: d.reviewPriority,
      sortOrder: d.sortOrder ?? req.sortOrder,
      sourceUrl: d.sourceUrl || null,
      notes: d.notes || null,
      dateVerified: new Date(),
    },
  });
  await writeAudit({ userId: actor.id, action: "procedure.requirement_update", entity: "ProcedureRequirement", entityId: requirementId, metadata: { code: req.code } });
}

export async function addDependency(actor: AuthUser, requirementId: string, prerequisiteId: string) {
  await requirePermission(actor, "document_rules.manage");
  if (requirementId === prerequisiteId) throw new ValidationError("A requirement cannot depend on itself");
  const [a, b] = await Promise.all([db.procedureRequirement.findUnique({ where: { id: requirementId } }), db.procedureRequirement.findUnique({ where: { id: prerequisiteId } })]);
  if (!a || !b || a.procedureVersionId !== b.procedureVersionId) throw new ValidationError("Both requirements must belong to the same version");
  await editableVersion(a.procedureVersionId);
  const existing = await db.requirementDependency.findMany({ where: { requirement: { procedureVersionId: a.procedureVersionId } }, include: { requirement: { select: { code: true } }, prerequisite: { select: { code: true } } } });
  const defs = [...existing.map((d) => ({ requirementCode: d.requirement.code, prerequisiteCode: d.prerequisite.code })), { requirementCode: a.code, prerequisiteCode: b.code }];
  if (hasDependencyCycle(defs)) throw new ValidationError("This dependency would create a cycle");
  await db.requirementDependency.upsert({ where: { requirementId_prerequisiteId: { requirementId, prerequisiteId } }, create: { requirementId, prerequisiteId }, update: {} });
  await writeAudit({ userId: actor.id, action: "procedure.dependency_add", entity: "ProcedureRequirement", entityId: requirementId, metadata: { prerequisite: b.code } });
}

export async function removeDependency(actor: AuthUser, id: string) {
  await requirePermission(actor, "document_rules.manage");
  const dep = await db.requirementDependency.findUnique({ where: { id }, include: { requirement: true } });
  if (!dep) throw new NotFoundError();
  await editableVersion(dep.requirement.procedureVersionId);
  await db.requirementDependency.delete({ where: { id } });
  await writeAudit({ userId: actor.id, action: "procedure.dependency_remove", entity: "ProcedureRequirement", entityId: dep.requirementId });
}

const deadlineSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["FIXED_DATE", "OFFSET"]),
  fixedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  offsetBasis: z.string().trim().max(80).optional(),
  offsetDays: z.coerce.number().int().min(0).max(3650).optional(),
  dayType: z.enum(["CALENDAR_DAYS", "WORKING_DAYS"]).default("CALENDAR_DAYS"),
  holidayCountryCode: z.string().trim().max(2).optional(),
  reminderDays: z.string().trim().optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  sourceUrl: z.string().trim().max(400).optional(),
  legalBasis: z.string().trim().max(200).optional(),
});

export async function saveDeadline(actor: AuthUser, versionId: string, input: unknown) {
  await requirePermission(actor, "procedures.manage");
  await editableVersion(versionId);
  const d = deadlineSchema.parse(input);
  if (d.kind === "FIXED_DATE" && !d.fixedDate) throw new ValidationError("A fixed date is required");
  if (d.kind === "OFFSET" && (d.offsetDays === undefined || !d.offsetBasis)) throw new ValidationError("An offset and its basis field are required");
  const reminders = d.reminderDays ? d.reminderDays.split(/[\s,]+/).filter(Boolean).map(Number) : [30, 14, 7, 3, 1];
  if (reminders.some((n) => !Number.isInteger(n) || n < 0)) throw new ValidationError("Reminder days must be whole numbers");
  const data = {
    name: d.name,
    kind: d.kind,
    fixedDate: d.kind === "FIXED_DATE" ? fromISODate(d.fixedDate!) : null,
    offsetBasis: d.kind === "OFFSET" ? d.offsetBasis : null,
    offsetDays: d.kind === "OFFSET" ? d.offsetDays : null,
    dayType: d.dayType,
    holidayCountryCode: d.holidayCountryCode || null,
    reminderDays: reminders,
    priority: d.priority,
    sourceUrl: d.sourceUrl || null,
    legalBasis: d.legalBasis || null,
    dateVerified: new Date(),
  };
  await db.procedureDeadline.upsert({ where: { procedureVersionId_code: { procedureVersionId: versionId, code: d.code } }, create: { procedureVersionId: versionId, code: d.code, ...data }, update: data });
  await writeAudit({ userId: actor.id, action: "procedure.deadline_save", entity: "ProcedureVersion", entityId: versionId, metadata: { code: d.code } });
}

/** Parameters hold the values: amounts, months, allowed relationships… Stored as JSON under the version. */
export async function saveParameter(actor: AuthUser, versionId: string, key: string, valueJson: string, description?: string) {
  await requirePermission(actor, "procedures.manage");
  await editableVersion(versionId);
  z.string().trim().min(2).max(80).regex(/^[a-z][\w.]*$/).parse(key);
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    throw new ValidationError("The value must be valid JSON");
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "amountMinor" in (value as object)) {
    const m = value as { amountMinor: unknown; currency: unknown };
    if (!Number.isInteger(m.amountMinor) || typeof m.currency !== "string") throw new ValidationError("Money values need an integer amountMinor and a currency");
  }
  await db.procedureParameter.upsert({
    where: { procedureVersionId_key: { procedureVersionId: versionId, key } },
    create: { procedureVersionId: versionId, key, value: value as Prisma.InputJsonValue, description },
    update: { value: value as Prisma.InputJsonValue, description },
  });
  await writeAudit({ userId: actor.id, action: "procedure.parameter_save", entity: "ProcedureVersion", entityId: versionId, metadata: { key } });
}

export async function setVersionStatus(actor: AuthUser, versionId: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED") {
  await requirePermission(actor, "procedures.manage");
  const v = await db.procedureVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new NotFoundError();
  await db.$transaction(async (tx) => {
    if (status === "ACTIVE") {
      // one ACTIVE version per procedure and academic year
      await tx.procedureVersion.updateMany({ where: { procedureId: v.procedureId, academicYearId: v.academicYearId, status: "ACTIVE", id: { not: v.id } }, data: { status: "ARCHIVED" } });
    }
    await tx.procedureVersion.update({ where: { id: versionId }, data: { status, activatedAt: status === "ACTIVE" ? new Date() : v.activatedAt } });
    await writeAudit({ userId: actor.id, action: "procedure.status_change", entity: "ProcedureVersion", entityId: versionId, metadata: { from: v.status, to: status } }, tx);
  });
}

/** Copy a version (requirements, rule trees, dependencies, deadlines, parameters) into a new DRAFT. Cases are unaffected. */
export async function cloneVersion(actor: AuthUser, versionId: string, academicYearId: string): Promise<string> {
  await requirePermission(actor, "procedures.manage");
  const src = await db.procedureVersion.findUnique({
    where: { id: versionId },
    include: { requirements: { include: { documentRequirements: true } }, ruleGroups: { include: { conditions: true } }, deadlines: true, parameters: true },
  });
  if (!src) throw new NotFoundError();
  const last = await db.procedureVersion.aggregate({ where: { procedureId: src.procedureId, academicYearId }, _max: { versionNumber: true } });
  const deps = await db.requirementDependency.findMany({ where: { requirement: { procedureVersionId: versionId } } });
  return db.$transaction(async (tx) => {
    const v = await tx.procedureVersion.create({ data: { procedureId: src.procedureId, academicYearId, versionNumber: (last._max.versionNumber ?? 0) + 1, status: "DRAFT", notes: `Cloned from version ${src.versionNumber}` } });
    const groupMap = new Map<string, string>();
    // parents first
    const pending = [...src.ruleGroups];
    while (pending.length) {
      const idx = pending.findIndex((g) => !g.parentId || groupMap.has(g.parentId));
      const [g] = pending.splice(idx, 1);
      const created = await tx.procedureRuleGroup.create({ data: { procedureVersionId: v.id, parentId: g.parentId ? groupMap.get(g.parentId)! : null, operator: g.operator, sortOrder: g.sortOrder, label: g.label } });
      groupMap.set(g.id, created.id);
      for (const c of g.conditions) await tx.procedureRuleCondition.create({ data: { groupId: created.id, sortOrder: c.sortOrder, field: c.field, operator: c.operator, valueType: c.valueType, value: (c.value ?? undefined) as Prisma.InputJsonValue | undefined } });
    }
    const reqMap = new Map<string, string>();
    for (const r of src.requirements) {
      const created = await tx.procedureRequirement.create({
        data: {
          procedureVersionId: v.id, code: r.code, kind: r.kind, subjectType: r.subjectType, name: r.name, nameI18n: (r.nameI18n ?? undefined) as Prisma.InputJsonValue | undefined, description: r.description, whyI18n: (r.whyI18n ?? undefined) as Prisma.InputJsonValue | undefined,
          mandatory: r.mandatory, calculationKey: r.calculationKey, reviewReason: r.reviewReason, reviewPriority: r.reviewPriority, nationality: r.nationality, notes: r.notes, sortOrder: r.sortOrder,
          ruleGroupId: r.ruleGroupId ? groupMap.get(r.ruleGroupId) : null, deadlineCode: r.deadlineCode, sourceId: r.sourceId, sourceUrl: r.sourceUrl, dateVerified: r.dateVerified, requiredFormalities: r.requiredFormalities,
        },
      });
      reqMap.set(r.id, created.id);
      for (const dr of r.documentRequirements) await tx.documentRequirement.create({ data: { requirementId: created.id, documentTypeId: dr.documentTypeId, helpI18n: (dr.helpI18n ?? undefined) as Prisma.InputJsonValue | undefined, requiredFormalities: dr.requiredFormalities } });
    }
    for (const d of deps) await tx.requirementDependency.create({ data: { requirementId: reqMap.get(d.requirementId)!, prerequisiteId: reqMap.get(d.prerequisiteId)! } });
    for (const d of src.deadlines) await tx.procedureDeadline.create({ data: { procedureVersionId: v.id, universityId: d.universityId, code: d.code, name: d.name, description: d.description, scope: d.scope, kind: d.kind, fixedDate: d.fixedDate, offsetBasis: d.offsetBasis, offsetDays: d.offsetDays, dayType: d.dayType, holidayCountryCode: d.holidayCountryCode, reminderDays: d.reminderDays, responsibleRole: d.responsibleRole, priority: d.priority, mandatory: d.mandatory, legalBasis: d.legalBasis, sourceId: d.sourceId, sourceUrl: d.sourceUrl, dateVerified: d.dateVerified, notes: d.notes } });
    for (const p of src.parameters) await tx.procedureParameter.create({ data: { procedureVersionId: v.id, key: p.key, value: p.value as Prisma.InputJsonValue, description: p.description, sourceId: p.sourceId } });
    await writeAudit({ userId: actor.id, action: "procedure.clone", entity: "ProcedureVersion", entityId: v.id, metadata: { from: versionId } }, tx);
    return v.id;
  });
}

// ───────────── Explicit case migration to a new procedure version ─────────────

export interface MigrationDiff {
  caseId: string;
  fromVersionId: string;
  toVersionId: string;
  added: Array<{ code: string; subject: string }>;
  removed: Array<{ code: string; subject: string; hasDocuments: boolean }>;
  unchanged: number;
}

/** Show what would change if the case moved to another version. Nothing is written. */
export async function previewMigration(actor: AuthUser, caseId: string, toVersionId: string): Promise<MigrationDiff> {
  await requirePermission(actor, "procedures.manage");
  const c = await db.case.findUnique({ where: { id: caseId }, select: { procedureVersionId: true } });
  if (!c) throw new NotFoundError();
  const [def, facts, existing] = await Promise.all([
    loadProcedureDefinition(toVersionId),
    loadCaseFacts(caseId),
    db.documentRequirementInstance.findMany({ where: { caseId, status: { not: "NOT_APPLICABLE" } }, include: { requirement: { select: { code: true } }, documents: { select: { versions: { select: { id: true }, take: 1 } } } } }),
  ]);
  const result = evaluateCase(facts, def);
  const wanted = new Map(result.instances.map((i) => [i.key, i]));
  const have = new Map(existing.map((i) => [`${i.requirement.code}|${i.subjectType}|${i.subjectId}`, i]));
  return {
    caseId,
    fromVersionId: c.procedureVersionId,
    toVersionId,
    added: [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, i]) => ({ code: i.requirementCode, subject: i.subjectLabel })),
    removed: [...have.entries()].filter(([k]) => !wanted.has(k)).map(([k, i]) => ({ code: k.split("|")[0], subject: i.subjectLabel ?? "", hasDocuments: i.documents.some((d) => d.versions.length > 0) })),
    unchanged: [...wanted.keys()].filter((k) => have.has(k)).length,
  };
}

/** Explicit admin action. Instances are re-pointed to the new version's requirements by code; nothing is deleted. */
export async function migrateCase(actor: AuthUser, caseId: string, toVersionId: string) {
  await requirePermission(actor, "procedures.manage");
  const [c, target] = await Promise.all([db.case.findUnique({ where: { id: caseId } }), db.procedureVersion.findUnique({ where: { id: toVersionId }, include: { requirements: true, academicYear: true } })]);
  if (!c || !target) throw new NotFoundError();
  if (target.status === "ARCHIVED") throw new ConflictError("Cannot migrate to an archived version");
  if (c.procedureVersionId === toVersionId) throw new ConflictError("The case is already on this version");
  await db.$transaction(async (tx) => {
    const byCode = new Map(target.requirements.map((r) => [r.code, r.id]));
    const instances = await tx.documentRequirementInstance.findMany({ where: { caseId }, include: { requirement: { select: { code: true } } } });
    for (const i of instances) {
      const next = byCode.get(i.requirement.code);
      if (next) await tx.documentRequirementInstance.update({ where: { id: i.id }, data: { requirementId: next } });
    }
    await tx.case.update({ where: { id: caseId }, data: { procedureVersionId: toVersionId } });
    await writeAudit({ userId: actor.id, action: "case.procedure_migrate", entity: "Case", entityId: caseId, caseId, metadata: { from: c.procedureVersionId, to: toVersionId } }, tx);
    await writeTimeline({ caseId, type: "case.procedure_migrated", title: "Procedure version changed", detail: `${target.academicYear.label} · v${target.versionNumber}`, actorId: actor.id, visibleToStudent: false }, tx);
    await evaluateAndPersist(caseId, { userId: actor.id, reason: "procedure.migrate" }, tx);
  });
}
