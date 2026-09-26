import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { assertSameOrigin, jsonError, requestIp } from "@/server/api";
import { recordTransaction } from "@/server/payments";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

/** Staff record a transaction (multipart, optional `receipt` file). Amount is a decimal string in the payment's currency. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await req.formData();
    const str = (k: string) => (typeof form.get(k) === "string" ? String(form.get(k)) : "");
    const paymentId = str("paymentId");
    const currency = str("currency");
    if (!paymentId || !currency) throw new ValidationError("paymentId and currency are required");
    const amount = (() => {
      try {
        return parseMoney(str("amount"), currency);
      } catch (e) {
        throw new ValidationError((e as Error).message);
      }
    })();
    const receipt = form.get("receipt");
    const result = await recordTransaction(user, {
      paymentId,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      paidAt: str("paidAt"),
      method: str("method") || "Cash",
      reference: str("reference") || undefined,
      notes: str("notes") || undefined,
      receipt: receipt instanceof File && receipt.size > 0 ? { buffer: Buffer.from(await receipt.arrayBuffer()), filename: receipt.name } : undefined,
      ip: requestIp(req),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
