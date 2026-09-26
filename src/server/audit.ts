import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  caseId?: string | null;
  ip?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail. There is deliberately no update/delete API; a database trigger
 * (see migration "audit_log_immutable") also rejects UPDATE and DELETE on audit_logs.
 */
export async function writeAudit(entry: AuditEntry, client: Tx | typeof db = db): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      caseId: entry.caseId ?? null,
      ipAddress: entry.ip ?? null,
      metadata: entry.metadata,
    },
  });
}

/** Timeline entries are the case-facing history (visible to staff; optionally to the student). */
export async function writeTimeline(
  entry: {
    caseId: string;
    type: string;
    title: string;
    detail?: string | null;
    visibleToStudent?: boolean;
    actorId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  client: Tx | typeof db = db,
): Promise<void> {
  await client.timelineEntry.create({
    data: {
      caseId: entry.caseId,
      type: entry.type,
      title: entry.title,
      detail: entry.detail ?? null,
      visibleToStudent: entry.visibleToStudent ?? true,
      actorId: entry.actorId ?? null,
      metadata: entry.metadata,
    },
  });
}
