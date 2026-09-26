import { db, type Tx } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { writeAudit, writeTimeline } from "@/server/audit";

export const DEFAULT_PROCEDURE_KEY = "IT-STUDY-VISA-TN";

/** The ACTIVE procedure version for the current academic year. Cases keep the version they were created with. */
export async function findActiveProcedureVersionId(client: Tx | typeof db = db): Promise<string> {
  const version = await client.procedureVersion.findFirst({
    where: { status: "ACTIVE", procedure: { key: DEFAULT_PROCEDURE_KEY }, academicYear: { isCurrent: true } },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  if (!version) throw new ValidationError("No active procedure version is configured");
  return version.id;
}

function caseNumber(year: number, n: number): string {
  return `BI-${year}-${String(n).padStart(5, "0")}`;
}

/** Create the case of a student on the active procedure version, at the given journey stage. */
export async function createCaseForStudent(
  tx: Tx,
  studentId: string,
  opts: { stageKey?: string; actorId?: string | null; assignStaffIds?: string[] } = {},
): Promise<string> {
  const [versionId, stage] = await Promise.all([
    findActiveProcedureVersionId(tx),
    tx.caseStage.findUniqueOrThrow({ where: { key: opts.stageKey ?? "REGISTRATION" } }),
  ]);
  const year = new Date().getUTCFullYear();
  const base = await tx.case.count();
  let created: { id: string } | null = null;
  for (let attempt = 1; attempt <= 20 && !created; attempt++) {
    const number = caseNumber(year, base + attempt);
    if (await tx.case.findUnique({ where: { caseNumber: number }, select: { id: true } })) continue;
    created = await tx.case.create({ data: { caseNumber: number, studentId, procedureVersionId: versionId, currentStageId: stage.id } });
  }
  if (!created) throw new Error("Could not allocate a case number");
  await tx.caseStageHistory.create({ data: { caseId: created.id, toStageId: stage.id, changedById: opts.actorId ?? null, note: "Case created" } });
  await writeTimeline({ caseId: created.id, type: "case.created", title: "Case created", actorId: opts.actorId ?? null }, tx);
  await writeAudit({ userId: opts.actorId ?? null, action: "case.create", entity: "Case", entityId: created.id, caseId: created.id }, tx);
  for (const userId of opts.assignStaffIds ?? []) {
    await tx.caseAssignment.create({ data: { caseId: created.id, userId } });
  }
  return created.id;
}

/** Change the journey stage; recorded in case_stage_history and on the timeline. */
export async function changeCaseStage(
  tx: Tx,
  caseId: string,
  toStageKey: string,
  actor: { userId: string | null; note?: string },
): Promise<void> {
  const [c, to] = await Promise.all([
    tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { currentStageId: true } }),
    tx.caseStage.findUniqueOrThrow({ where: { key: toStageKey } }),
  ]);
  if (c.currentStageId === to.id) return;
  await tx.case.update({ where: { id: caseId }, data: { currentStageId: to.id } });
  await tx.caseStageHistory.create({ data: { caseId, fromStageId: c.currentStageId, toStageId: to.id, changedById: actor.userId, note: actor.note } });
  await writeTimeline({ caseId, type: "case.stage_changed", title: "Stage changed", detail: to.name, actorId: actor.userId, metadata: { stage: to.key } }, tx);
  await writeAudit({ userId: actor.userId, action: "case.stage_change", entity: "Case", entityId: caseId, caseId, metadata: { to: to.key } }, tx);
}
