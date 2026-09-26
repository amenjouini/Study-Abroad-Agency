import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/errors";
import { assertSameOrigin, jsonError, requestIp } from "@/server/api";
import { uploadDocumentVersion } from "@/server/documents";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

/** multipart upload: fields `instanceId` and `file`. Validated (size, extension, MIME sniffing) in the service. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await req.formData();
    const instanceId = form.get("instanceId");
    const file = form.get("file");
    if (typeof instanceId !== "string" || !(file instanceof File)) throw new ValidationError("instanceId and file are required");
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadDocumentVersion(user, { instanceId, buffer, filename: file.name, ip: requestIp(req) });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
