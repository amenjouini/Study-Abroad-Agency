import { db } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { blockingPrerequisites, isSatisfied } from "@/lib/engine/dependencies";
import type { RequirementStatus } from "@/lib/engine/types";
import { formatMoney, type Money } from "@/lib/money";
import { localized } from "@/lib/format";
import { maxUploadBytes } from "@/lib/upload";
import { authorizeCaseDocuments } from "@/server/documents";
import type { AuthUser } from "@/server/authz";

export interface CalcView {
  type: "passport" | "funding";
  ok: boolean | null;
  passport?: { expiry: string | null; requiredAfter: string | null; referenceDate: string | null; referenceSource: string | null; months: number };
  funding?: { required: string; available: string; shortfall: string; surplus: string; proposed?: string | null };
}

export interface DocumentCard {
  id: string;
  code: string;
  kind: "DOCUMENT" | "CALCULATED" | "HUMAN_REVIEW";
  name: string;
  why: string;
  subjectType: string;
  subjectLabel: string;
  status: RequirementStatus;
  mandatory: boolean;
  deadline: string | null;
  rejectionReason: string | null;
  requiredFormalities: string[];
  blockedBy: string[];
  latestVersionId: string | null;
  versions: Array<{ id: string; number: number; status: string; filename: string; uploadedAt: string; reason: string | null; superseded: boolean }>;
  calc: CalcView | null;
}

export interface CaseDocumentsView {
  caseId: string;
  approved: number;
  total: number;
  maxMb: number;
  cards: DocumentCard[];
}

/** Progress used by the student dashboard and the documents page: mandatory DOCUMENT requirements only. */
export async function documentProgress(caseId: string): Promise<{ approved: number; total: number }> {
  const rows = await db.documentRequirementInstance.findMany({
    where: { caseId, status: { not: "NOT_APPLICABLE" }, requirement: { kind: "DOCUMENT", mandatory: true } },
    select: { status: true },
  });
  return { approved: rows.filter((r) => r.status === "APPROVED").length, total: rows.length };
}

function moneyOf(v: unknown, locale: string): string {
  const m = v as Money | undefined;
  return m && typeof m.amountMinor === "number" ? formatMoney(m, locale) : "—";
}

function buildCalc(code: string, kind: string, calculation: unknown, status: RequirementStatus, locale: string): CalcView | null {
  if (kind !== "CALCULATED" || !calculation || typeof calculation !== "object") return null;
  const c = calculation as Record<string, unknown>;
  if ("requiredValidUntilAfter" in c) {
    return {
      type: "passport",
      ok: c.satisfied === true ? true : c.satisfied === false ? false : null,
      passport: {
        expiry: (c.passportExpiry as string) ?? null,
        requiredAfter: (c.requiredValidUntilAfter as string) ?? null,
        referenceDate: (c.referenceDate as string) ?? null,
        referenceSource: (c.referenceSource as string) ?? null,
        months: Number(c.monthsRequired ?? 0),
      },
    };
  }
  if ("shortfall" in c) {
    return {
      type: "funding",
      ok: status === "APPROVED",
      funding: {
        required: moneyOf(c.required, locale),
        available: moneyOf(c.available, locale),
        shortfall: moneyOf(c.shortfall, locale),
        surplus: moneyOf(c.surplus, locale),
      },
    };
  }
  void code;
  return null;
}

/** Everything the student's documents page needs. Students see only their own case; internal comments are never included. */
export async function getCaseDocumentsView(actor: AuthUser, caseId: string, locale: string): Promise<CaseDocumentsView> {
  await authorizeCaseDocuments(actor, caseId, "read");
  const c = await db.case.findUniqueOrThrow({ where: { id: caseId }, select: { procedureVersionId: true } });
  const [instances, deps] = await Promise.all([
    db.documentRequirementInstance.findMany({
      where: { caseId, status: { not: "NOT_APPLICABLE" } },
      include: {
        requirement: true,
        documents: { include: { versions: { orderBy: { versionNumber: "desc" } } } },
      },
      orderBy: [{ requirement: { sortOrder: "asc" } }, { createdAt: "asc" }],
    }),
    db.requirementDependency.findMany({
      where: { requirement: { procedureVersionId: c.procedureVersionId } },
      include: { requirement: { select: { code: true } }, prerequisite: { select: { code: true } } },
    }),
  ]);
  const depDefs = deps.map((d) => ({ requirementCode: d.requirement.code, prerequisiteCode: d.prerequisite.code }));
  const asSatisfiable = instances.map((i) => ({ requirementCode: i.requirement.code, subjectType: i.subjectType, subjectId: i.subjectId, status: i.status, name: localized(i.requirement.nameI18n, locale, i.requirement.name) }));

  const cards: DocumentCard[] = instances.map((i, idx) => {
    const versions = i.documents.flatMap((d) => d.versions);
    const blocked = blockingPrerequisites(asSatisfiable[idx], asSatisfiable, depDefs).map((b) => b.name);
    return {
      id: i.id,
      code: i.requirement.code,
      kind: i.requirement.kind,
      name: localized(i.requirement.nameI18n, locale, i.requirement.name),
      why: localized(i.requirement.whyI18n, locale, i.requirement.description ?? ""),
      subjectType: i.subjectType,
      subjectLabel: i.subjectLabel ?? "",
      status: i.status,
      mandatory: i.requirement.mandatory,
      deadline: i.deadline ? toISODate(i.deadline) : null,
      rejectionReason: i.rejectionReason,
      requiredFormalities: i.requirement.requiredFormalities,
      blockedBy: [...new Set(blocked)],
      latestVersionId: versions[0]?.id ?? null,
      versions: versions.map((v) => ({
        id: v.id,
        number: v.versionNumber,
        status: v.status,
        filename: v.filename,
        uploadedAt: v.uploadedAt.toISOString(),
        reason: v.rejectionReason,
        superseded: v.status === "SUPERSEDED",
      })),
      calc: buildCalc(i.requirement.code, i.requirement.kind, i.calculation, i.status, locale),
    };
  });

  const docs = cards.filter((x) => x.kind === "DOCUMENT" && x.mandatory);
  return {
    caseId,
    approved: docs.filter((x) => isSatisfied(x.status) && x.status === "APPROVED").length,
    total: docs.length,
    maxMb: Math.round(maxUploadBytes() / 1024 / 1024),
    cards,
  };
}

/** Next thing the student should do: the first mandatory document that is waiting, rejected or needs correction. */
export function nextAction(cards: DocumentCard[]): DocumentCard | null {
  const order: RequirementStatus[] = ["REJECTED", "NEEDS_CORRECTION", "EXPIRED", "NOT_STARTED", "REQUESTED"];
  for (const s of order) {
    const found = cards.find((c) => c.kind === "DOCUMENT" && c.mandatory && c.status === s && c.blockedBy.length === 0);
    if (found) return found;
  }
  return null;
}
