import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";

export interface NotificationInput {
  userId: string;
  caseId?: string | null;
  /** e.g. document.approved, document.rejected, payment.due, appointment.tomorrow, deadline.approaching, message.new, visa.status */
  type: string;
  title: string;
  body?: string | null;
  /** Parameters for the translated text */
  data?: Prisma.InputJsonValue;
  link?: string | null;
}

/**
 * Delivery channels (in-app, e-mail, SMS, WhatsApp) sit behind this interface.
 * Only the in-app channel is implemented; no provider is hard-coded.
 */
export interface NotificationChannel {
  readonly name: string;
  deliver(n: NotificationInput): Promise<void>;
}

class InAppChannel implements NotificationChannel {
  readonly name = "in-app";
  constructor(private readonly client: Tx | typeof db) {}
  async deliver(n: NotificationInput): Promise<void> {
    await this.client.notification.create({
      data: {
        userId: n.userId,
        caseId: n.caseId ?? null,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        data: n.data,
        link: n.link ?? null,
      },
    });
  }
}

export function channelsFor(client: Tx | typeof db = db): NotificationChannel[] {
  return [new InAppChannel(client)];
}

export async function notify(input: NotificationInput | NotificationInput[], client: Tx | typeof db = db): Promise<void> {
  const list = Array.isArray(input) ? input : [input];
  for (const n of list) for (const ch of channelsFor(client)) await ch.deliver(n);
}

/** Active staff assigned to a case. */
export async function assignedStaffIds(caseId: string, client: Tx | typeof db = db): Promise<string[]> {
  const rows = await client.caseAssignment.findMany({ where: { caseId, active: true }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** The student's user id for a case. */
export async function studentUserId(caseId: string, client: Tx | typeof db = db): Promise<string> {
  const c = await client.case.findUniqueOrThrow({ where: { id: caseId }, select: { student: { select: { userId: true } } } });
  return c.student.userId;
}
