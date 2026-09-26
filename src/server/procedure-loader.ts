import { db, type Tx } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import type {
  DeadlineDef,
  ProcedureDefinition,
  RuleNode,
  RuleOperator,
  RuleGroupOperator,
} from "@/lib/engine/types";

type Client = Tx | typeof db;

interface GroupRow {
  id: string;
  parentId: string | null;
  operator: RuleGroupOperator;
  sortOrder: number;
  conditions: Array<{ field: string; operator: RuleOperator; value: unknown; sortOrder: number }>;
}

function buildRuleTree(rootId: string, groups: Map<string, GroupRow>, children: Map<string, GroupRow[]>): RuleNode {
  const g = groups.get(rootId)!;
  const conditionNodes: RuleNode[] = [...g.conditions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ type: "condition", field: c.field, operator: c.operator, value: c.value ?? undefined }));
  const groupNodes: RuleNode[] = (children.get(rootId) ?? [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((child) => buildRuleTree(child.id, groups, children));
  return { type: "group", operator: g.operator, children: [...conditionNodes, ...groupNodes] };
}

/** Load a procedure version (requirements, rule trees, dependencies, deadlines, parameters, holidays) for the engine. */
export async function loadProcedureDefinition(versionId: string, client: Client = db): Promise<ProcedureDefinition> {
  const version = await client.procedureVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      academicYear: true,
      procedure: { include: { destinationCountry: true } },
      parameters: true,
      requirements: true,
      ruleGroups: { include: { conditions: true } },
      deadlines: { include: { source: true } },
    },
  });

  const groups = new Map<string, GroupRow>(
    version.ruleGroups.map((g) => [
      g.id,
      {
        id: g.id,
        parentId: g.parentId,
        operator: g.operator,
        sortOrder: g.sortOrder,
        conditions: g.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value, sortOrder: c.sortOrder })),
      },
    ]),
  );
  const children = new Map<string, GroupRow[]>();
  for (const g of groups.values()) {
    if (g.parentId) children.set(g.parentId, [...(children.get(g.parentId) ?? []), g]);
  }

  const deps = await client.requirementDependency.findMany({
    where: { requirement: { procedureVersionId: versionId } },
    include: { requirement: { select: { code: true } }, prerequisite: { select: { code: true } } },
  });

  const holidayCodes = new Set<string>([version.procedure.destinationCountry.code]);
  for (const d of version.deadlines) if (d.holidayCountryCode) holidayCodes.add(d.holidayCountryCode);
  const holidayRows = await client.holiday.findMany({
    where: { country: { code: { in: [...holidayCodes] } } },
    include: { country: { select: { code: true } } },
  });
  const holidays: Record<string, string[]> = {};
  for (const h of holidayRows) (holidays[h.country.code] ??= []).push(toISODate(h.date));

  const deadlines: DeadlineDef[] = version.deadlines.map((d) => ({
    code: d.code,
    name: d.name,
    scope: d.scope,
    kind: d.kind,
    fixedDate: d.fixedDate ? toISODate(d.fixedDate) : null,
    offsetBasis: d.offsetBasis,
    offsetDays: d.offsetDays,
    dayType: d.dayType,
    holidayCountryCode: d.holidayCountryCode,
    reminderDays: d.reminderDays,
    priority: d.priority,
    sourceName: d.legalBasis ?? d.source?.name ?? null,
    sourceUrl: d.legalBasis ? null : (d.sourceUrl ?? d.source?.url ?? null),
  }));

  return {
    versionId: version.id,
    academicYear: version.academicYear.label,
    parameters: Object.fromEntries(version.parameters.map((p) => [p.key, p.value])),
    requirements: version.requirements.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind,
      subjectType: r.subjectType,
      name: r.name,
      mandatory: r.mandatory,
      calculationKey: r.calculationKey,
      reviewReason: r.reviewReason,
      reviewPriority: r.reviewPriority,
      deadlineCode: r.deadlineCode,
      sortOrder: r.sortOrder,
      rule: r.ruleGroupId && groups.has(r.ruleGroupId) ? buildRuleTree(r.ruleGroupId, groups, children) : null,
    })),
    dependencies: deps.map((d) => ({ requirementCode: d.requirement.code, prerequisiteCode: d.prerequisite.code })),
    deadlines,
    holidays,
  };
}
