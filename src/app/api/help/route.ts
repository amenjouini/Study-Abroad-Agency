import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError } from "@/server/api";
import { createHelpRequest } from "@/server/messaging";
import { filesFrom } from "@/server/multipart";
import { requireUser } from "@/server/session";

export const runtime = "nodejs";

/** "I need help": multipart form with `description`, `priority` and optional `files`. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await req.formData();
    const id = await createHelpRequest(user, { description: form.get("description"), priority: form.get("priority") ?? "NORMAL" }, await filesFrom(form));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
