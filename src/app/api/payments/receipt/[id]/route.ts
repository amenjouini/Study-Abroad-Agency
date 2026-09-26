import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { jsonError } from "@/server/api";
import { requirePermission } from "@/server/authz";
import { requireUser } from "@/server/session";
import { getStorage } from "@/server/storage";

export const runtime = "nodejs";

/** Receipt of a recorded transaction. Students may read receipts of their own case; staff need payments.read on it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const t = await db.paymentTransaction.findUnique({ where: { id: (await params).id }, include: { payment: { select: { caseId: true } } } });
    if (!t || !t.receiptStorageKey) throw new NotFoundError();
    await requirePermission(user, user.roleKey === "STUDENT" ? "self.profile" : "payments.read", { caseId: t.payment.caseId });
    const body = await getStorage().get(t.receiptStorageKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": t.receiptFilename?.endsWith(".pdf") ? "application/pdf" : t.receiptFilename?.endsWith(".png") ? "image/png" : "image/jpeg",
        "Content-Disposition": `inline; filename="${(t.receiptFilename ?? "receipt").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
