import { jsonError, requestIp } from "@/server/api";
import { exportCsv } from "@/server/exports";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const user = await requireUser();
    const { filename, body } = await exportCsv(user, (await params).kind, requestIp(req));
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
