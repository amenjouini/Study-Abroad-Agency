import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { fromISODate, toISODate, todayISO } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { decimalsFor } from "@/lib/money";
import { computePaymentStatus, dueDateFor } from "@/lib/payments";
import { validateUpload } from "@/lib/upload";
import { writeAudit, writeTimeline } from "@/server/audit";
import { requirePermission, type AuthUser } from "@/server/authz";
import { notify, studentUserId } from "@/server/notifications";
import { getStorage } from "@/server/storage";

type Client = Tx | typeof db;

/** Create the case's payment obligations from an admin-configured plan (amounts stay in the plan's currency). */
export async function generatePaymentsFromPlan(caseId: string, planId?: string, client: Client = db, base: string = todayISO()): Promise<number> {
  const plan = planId
    ? await client.paymentPlan.findUniqueOrThrow({ where: { id: planId }, include: { items: true } })
    : await client.paymentPlan.findFirstOrThrow({ where: { isDefault: true, active: true }, include: { items: true } });
  let n = 0;
  for (const item of [...plan.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    await client.payment.create({
      data: {
        caseId,
        name: item.name,
        amountMinor: item.amountMinor,
        currency: plan.currency,
        dueDate: fromISODate(dueDateFor(base, item.dueOffsetDays)),
        sortOrder: item.sortOrder,
      },
    });
    n++;
  }
  return n;
}

export interface RecordTransactionInput {
  paymentId: string;
  /** Minor units (TND millimes / EUR cents) */
  amountMinor: number;
  currency: string;
  paidAt: string; // YYYY-MM-DD
  method: string;
  reference?: string;
  notes?: string;
  receipt?: { buffer: Buffer; filename: string };
  ip?: string | null;
}

/** Staff record a transaction (students do not pay online in this phase). */
export async function recordTransaction(actor: AuthUser, input: RecordTransactionInput): Promise<{ transactionId: string }> {
  const payment = await db.payment.findUnique({ where: { id: input.paymentId }, include: { transactions: true } });
  if (!payment) throw new NotFoundError("Payment not found");
  await requirePermission(actor, "payments.write", { caseId: payment.caseId });

  decimalsFor(input.currency);
  if (input.currency !== payment.currency) {
    throw new ValidationError(`This payment is in ${payment.currency}; amounts in different currencies are never combined`);
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new ValidationError("Amount must be a positive amount");
  if (payment.status === "CANCELLED") throw new ConflictError("This payment is cancelled");
  const paidBefore = payment.transactions.reduce((s, t) => s + t.amountMinor, 0);
  if (paidBefore + input.amountMinor > payment.amountMinor) throw new ValidationError("The amount exceeds the remaining balance");

  let receiptKey: string | undefined;
  let receiptFilename: string | undefined;
  if (input.receipt) {
    const v = await validateUpload(input.receipt.buffer, input.receipt.filename);
    receiptKey = `payments/${payment.id}/${randomUUID()}.${v.extension}`;
    receiptFilename = v.safeFilename;
    await getStorage().put(receiptKey, input.receipt.buffer, { contentType: v.mimeType });
  }

  const studentId = await studentUserId(payment.caseId);
  return db.$transaction(async (tx) => {
    const t = await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        currency: payment.currency,
        paidAt: fromISODate(input.paidAt),
        method: input.method,
        reference: input.reference || null,
        notes: input.notes || null,
        receiptStorageKey: receiptKey ?? null,
        receiptFilename: receiptFilename ?? null,
        recordedById: actor.id,
      },
    });
    const paid = paidBefore + input.amountMinor;
    const status = computePaymentStatus(
      { amountMinor: payment.amountMinor, currency: payment.currency, paidMinor: paid, dueDate: payment.dueDate ? toISODate(payment.dueDate) : null },
      todayISO(),
    );
    await tx.payment.update({ where: { id: payment.id }, data: { status } });
    await writeAudit(
      { userId: actor.id, action: "payment.transaction_create", entity: "PaymentTransaction", entityId: t.id, caseId: payment.caseId, ip: input.ip, metadata: { payment: payment.name, amountMinor: input.amountMinor, currency: payment.currency, status } },
      tx,
    );
    await writeTimeline({ caseId: payment.caseId, type: "payment.recorded", title: "Payment recorded", detail: payment.name, actorId: actor.id }, tx);
    await notify({ userId: studentId, caseId: payment.caseId, type: "payment.recorded", title: "Payment recorded", body: payment.name, data: { payment: payment.name }, link: "/student/payments" }, tx);
    return { transactionId: t.id };
  });
}

/** Persist LATE for overdue obligations (status is otherwise derived from amounts). */
export async function markLatePayments(client: Client = db, today: string = todayISO()): Promise<number> {
  const r = await client.payment.updateMany({
    where: { status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: fromISODate(today) } },
    data: { status: "LATE" },
  });
  return r.count;
}
