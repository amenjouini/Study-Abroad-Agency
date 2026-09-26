import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/server/api";
import { sendMessage } from "@/server/messaging";
import { filesFrom } from "@/server/multipart";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

/** Send a message: multipart with `body`, optional `caseId` (staff only), `documentIds` and `files`. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await req.formData();
    const caseId = form.get("caseId");
    const id = await sendMessage(
      user,
      { body: form.get("body"), documentIds: form.getAll("documentIds").map(String) },
      await filesFrom(form),
      user.roleKey === "STUDENT" ? undefined : typeof caseId === "string" ? caseId : undefined,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
