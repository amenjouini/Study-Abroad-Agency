import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { RuleNode } from "../../src/lib/engine/types";
import { DEADLINE } from "../../src/lib/engine/constants";
import {
  DATE_VERIFIED,
  DOCUMENT_TYPES,
  ITALY_2026_DEADLINES,
  ITALY_2026_DEPENDENCIES,
  ITALY_2026_PARAMETERS,
  ITALY_2026_REQUIREMENTS,
  SOURCES,
  SPONSOR_RELATIONSHIPS,
  type SourceKey,
} from "./procedure-data";

const verified = new Date(DATE_VERIFIED);

async function insertRule(db: PrismaClient, versionId: string, node: RuleNode, parentId: string | null, sortOrder = 0): Promise<string> {
  const root: RuleNode = node.type === "condition" ? { type: "group", operator: "AND", children: [node] } : node;
  if (root.type !== "group") throw new Error("unreachable");
  const group = await db.procedureRuleGroup.create({ data: { procedureVersionId: versionId, parentId, operator: root.operator, sortOrder } });
  let ci = 0;
  let gi = 0;
  for (const child of root.children) {
    if (child.type === "condition") {
      const v = child.value;
      const valueType =
        v && typeof v === "object" && !Array.isArray(v) ? "CALCULATED" : typeof v === "boolean" ? "BOOLEAN" : typeof v === "number" ? "NUMBER" : "STRING";
      await db.procedureRuleCondition.create({
        data: {
          groupId: group.id,
          sortOrder: ci++,
          field: child.field,
          operator: child.operator,
          valueType,
          value: v === undefined ? undefined : (v as Prisma.InputJsonValue),
        },
      });
    } else {
      await insertRule(db, versionId, child, group.id, gi++);
    }
  }
  return group.id;
}

async function upsertSources(db: PrismaClient): Promise<Record<SourceKey, string>> {
  const ids = {} as Record<SourceKey, string>;
  for (const [key, s] of Object.entries(SOURCES) as Array<[SourceKey, (typeof SOURCES)[SourceKey]]>) {
    const existing = await db.procedureSource.findFirst({ where: { url: s.url } });
    const row = existing ?? (await db.procedureSource.create({ data: { name: s.name, url: s.url, dateVerified: verified } }));
    ids[key] = row.id;
  }
  return ids;
}

export async function seedProcedures(db: PrismaClient) {
  if (await db.procedure.findUnique({ where: { key: "IT-STUDY-VISA-TN" } })) return;

  const [tn, it] = await Promise.all([db.country.findUniqueOrThrow({ where: { code: "TN" } }), db.country.findUniqueOrThrow({ where: { code: "IT" } })]);
  const y2026 = await db.academicYear.findUniqueOrThrow({ where: { label: "2026/27" } });
  const y2027 = await db.academicYear.findUniqueOrThrow({ where: { label: "2027/28" } });
  const sources = await upsertSources(db);

  for (const r of SPONSOR_RELATIONSHIPS) {
    await db.sponsorRelationship.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name, nameI18n: { en: r.name, fr: r.fr }, kinshipDegree: r.kinship },
    });
  }
  for (const t of DOCUMENT_TYPES) {
    await db.documentType.upsert({ where: { code: t.code }, update: {}, create: { code: t.code, name: t.name } });
  }

  const procedure = await db.procedure.create({
    data: {
      key: "IT-STUDY-VISA-TN",
      name: "Italy — Study visa (university enrollment) — Tunisia",
      originCountryId: tn.id,
      destinationCountryId: it.id,
    },
  });

  // ── 2026/27 · version 1 · ACTIVE ──
  const v1 = await db.procedureVersion.create({
    data: {
      procedureId: procedure.id,
      academicYearId: y2026.id,
      versionNumber: 1,
      status: "ACTIVE",
      activatedAt: new Date(),
      notes: `Embassy of Italy in Tunis notice of 1 June 2026. Verified ${DATE_VERIFIED}.`,
    },
  });

  for (const [key, p] of Object.entries(ITALY_2026_PARAMETERS)) {
    await db.procedureParameter.create({
      data: { procedureVersionId: v1.id, key, value: p.value as Prisma.InputJsonValue, description: p.description, sourceId: sources[p.source] },
    });
  }

  for (const d of ITALY_2026_DEADLINES) {
    await db.procedureDeadline.create({
      data: {
        procedureVersionId: v1.id,
        code: d.code,
        name: d.name,
        description: d.description,
        scope: d.scope,
        kind: d.kind,
        fixedDate: d.fixedDate ? new Date(d.fixedDate) : null,
        offsetBasis: d.offsetBasis,
        offsetDays: d.offsetDays,
        dayType: d.dayType,
        holidayCountryCode: d.holidayCountryCode,
        reminderDays: d.reminderDays,
        priority: d.priority,
        // A statutory basis (e.g. D.lgs. 286/1998) is recorded separately; the Embassy source stays attached.
        legalBasis: d.sourceName ?? null,
        sourceId: sources[d.source],
        sourceUrl: SOURCES[d.source].url,
        dateVerified: verified,
      },
    });
  }

  const docTypes = new Map((await db.documentType.findMany()).map((t) => [t.code, t.id]));
  const idByCode = new Map<string, string>();
  for (const [idx, r] of ITALY_2026_REQUIREMENTS.entries()) {
    const ruleGroupId = r.rule ? await insertRule(db, v1.id, r.rule, null) : null;
    const req = await db.procedureRequirement.create({
      data: {
        procedureVersionId: v1.id,
        code: r.code,
        kind: r.kind ?? "DOCUMENT",
        subjectType: r.subject,
        name: r.names[0],
        nameI18n: { en: r.names[0], fr: r.names[1], it: r.names[2], ar: r.names[3] },
        description: r.why[0],
        whyI18n: { en: r.why[0], fr: r.why[1] },
        mandatory: r.mandatory ?? true,
        calculationKey: r.calculationKey,
        reviewReason: r.reviewReason,
        reviewPriority: r.reviewPriority ?? "NORMAL",
        nationality: "TN",
        sortOrder: idx,
        ruleGroupId,
        deadlineCode: r.deadlineCode,
        sourceId: sources[r.source],
        sourceUrl: SOURCES[r.source].url,
        dateVerified: verified,
        requiredFormalities: r.formalities ?? [],
      },
    });
    idByCode.set(r.code, req.id);
    if (r.documentType && r.kind !== "HUMAN_REVIEW" && r.kind !== "CALCULATED") {
      await db.documentRequirement.create({
        data: { requirementId: req.id, documentTypeId: docTypes.get(r.documentType)!, requiredFormalities: r.formalities ?? [] },
      });
    }
  }
  for (const d of ITALY_2026_DEPENDENCIES) {
    await db.requirementDependency.create({
      data: { requirementId: idByCode.get(d.requirementCode)!, prerequisiteId: idByCode.get(d.prerequisiteCode)! },
    });
  }

  // ── 2027/28 · version 1 · DRAFT — only the deadline published by the MUR circular ──
  const v2 = await db.procedureVersion.create({
    data: {
      procedureId: procedure.id,
      academicYearId: y2027.id,
      versionNumber: 1,
      status: "DRAFT",
      notes: "Draft. Only the visa-appointment deadline from the MUR circular is known; financial values and requirements are not copied from 2026/27.",
    },
  });
  await db.procedureDeadline.create({
    data: {
      procedureVersionId: v2.id,
      code: DEADLINE.VISA_APPOINTMENT,
      name: "General deadline for fixing visa appointments",
      scope: "GENERAL",
      kind: "FIXED_DATE",
      fixedDate: new Date("2027-10-31"),
      dayType: "CALENDAR_DAYS",
      reminderDays: [30, 14, 7, 3, 1],
      priority: "HIGH",
      sourceId: sources.MUR_CIRCULAR,
      sourceUrl: SOURCES.MUR_CIRCULAR.url,
      dateVerified: verified,
    },
  });
}

export async function seedScholarships(db: PrismaClient) {
  if (await db.scholarship.findFirst({ where: { name: { startsWith: "DSU Toscana" } } })) return;
  const toscana = await db.region.findFirstOrThrow({ where: { name: "Toscana" } });
  const year = await db.academicYear.findUniqueOrThrow({ where: { label: "2026/27" } });
  const s = await db.scholarship.create({
    data: {
      name: "DSU Toscana — scholarship and accommodation",
      kind: "REGIONAL",
      regionId: toscana.id,
      officialUrl: SOURCES.DSU_TOSCANA.url,
    },
  });
  await db.scholarshipVersion.create({
    data: {
      scholarshipId: s.id,
      academicYearId: year.id,
      eligibility: "Economic thresholds: ISEE ≤ €27,000 and ISPE ≤ €60,000.",
      // 7 September 2026, 13:00 (Italy, CEST = UTC+2)
      deadline: new Date("2026-09-07T11:00:00Z"),
      extraDeadlines: {
        DOCTORAL_AND_SPECIALIZATION: { opensAt: "2026-09-25", closesAt: "2026-11-16T12:00:00Z", note: "25 September – 16 November 2026, 13:00 (Italy)" },
        BACHELOR_MASTER_SINGLE_CYCLE: { closesAt: "2026-09-07T11:00:00Z", note: "7 September 2026, 13:00 (Italy)" },
      },
      requiredDocuments: [
        {
          code: "FOREIGN_INCOME_AND_ASSETS",
          note: "Documents on foreign income and assets must be sent in original; late documents lead to exclusion.",
        },
      ],
      iseeMaxMinor: 2_700_000,
      ispeMaxMinor: 6_000_000,
      thresholdCurrency: "EUR",
      benefits: ["Cash grant", "Free university canteen", "Accommodation for students from out of town", "Tuition exemption"],
      sourceName: SOURCES.DSU_TOSCANA.name,
      sourceUrl: SOURCES.DSU_TOSCANA.url,
      dateVerified: verified,
      notes: "Values are specific to 2026/27 and are not permanent; each academic year has its own version.",
    },
  });
}
