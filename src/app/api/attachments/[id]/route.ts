import { jsonError } from "@/server/api";
import { readAttachment } from "@/server/messaging";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const file = await readAttachment(user, (await params).id);
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
