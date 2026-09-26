import { addCalendarDays, type ISODate } from "@/lib/dates";
import { money, sumMoney, type Money } from "@/lib/money";

export type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "LATE" | "CANCELLED";

export interface PaymentLike {
  amountMinor: number;
  currency: string;
  paidMinor: number;
  dueDate?: ISODate | null;
  cancelled?: boolean;
}

/** Status derived from amounts and the due date. Overdue unpaid or partly paid obligations are LATE. */
export function computePaymentStatus(p: PaymentLike, today: ISODate): PaymentStatus {
  if (p.cancelled) return "CANCELLED";
  if (p.paidMinor >= p.amountMinor) return "PAID";
  const overdue = !!p.dueDate && p.dueDate.slice(0, 10) < today;
  if (overdue) return "LATE";
  return p.paidMinor > 0 ? "PARTIALLY_PAID" : "PENDING";
}

export interface CurrencyTotals {
  currency: string;
  total: Money;
  paid: Money;
  remaining: Money;
}

/** Totals per currency — amounts in different currencies are never added together. */
export function summarizePayments(payments: PaymentLike[]): CurrencyTotals[] {
  const byCurrency = new Map<string, PaymentLike[]>();
  for (const p of payments) {
    if (p.cancelled) continue;
    byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p]);
  }
  return [...byCurrency.entries()].map(([currency, list]) => {
    const total = sumMoney(list.map((p) => money(p.amountMinor, currency)), currency);
    const paid = sumMoney(list.map((p) => money(Math.min(p.paidMinor, p.amountMinor), currency)), currency);
    return { currency, total, paid, remaining: money(total.amountMinor - paid.amountMinor, currency) };
  });
}

/** The next obligation to pay: earliest due date among unpaid ones (undated last). */
export function nextPayment<T extends PaymentLike & { sortOrder?: number }>(payments: T[]): T | null {
  const open = payments.filter((p) => !p.cancelled && p.paidMinor < p.amountMinor);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const da = a.dueDate ?? "9999-12-31";
    const db = b.dueDate ?? "9999-12-31";
    return da === db ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : da < db ? -1 : 1;
  })[0];
}

export function dueDateFor(base: ISODate, offsetDays: number): ISODate {
  return addCalendarDays(base, offsetDays);
}
