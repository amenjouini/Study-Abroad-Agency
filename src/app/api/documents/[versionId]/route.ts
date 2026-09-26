import { jsonError, requestIp } from "@/server/api";
import { readDocumentVersion } from "@/server/documents";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

/**
 * The only way a document leaves storage. The user is authenticated and authorized against the document's
 * case on every request; nothing is served from a public path and nothing is cached.
 */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireUser();
    const { versionId } = await params;
    const file = await readDocumentVersion(user, versionId, requestIp(req));
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.filename.replace(/"/g, "")}"`,
        "Content-Length": String(file.body.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
