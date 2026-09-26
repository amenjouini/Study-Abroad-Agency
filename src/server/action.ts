import { headers } from "next/headers";
import { ZodError } from "zod";
import { CodedError, ConflictError, ForbiddenError, NotFoundError, RateLimitError, UnauthenticatedError, ValidationError } from "@/lib/errors";

export type ActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "invalid_credentials"
  | "email_taken"
  | "unexpected";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> };

/** Wrap a server action body: known errors become typed results, unknown errors are logged and hidden. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // redirect()/notFound() from next/navigation must propagate
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    if (e instanceof CodedError) return { ok: false, code: e.code as ActionErrorCode, message: e.message };
    if (e instanceof UnauthenticatedError) return { ok: false, code: "unauthenticated", message: e.message };
    if (e instanceof ForbiddenError) return { ok: false, code: "forbidden", message: e.message };
    if (e instanceof NotFoundError) return { ok: false, code: "not_found", message: e.message };
    if (e instanceof RateLimitError) return { ok: false, code: "rate_limited", message: e.message };
    if (e instanceof ConflictError) return { ok: false, code: "conflict", message: e.message };
    if (e instanceof ValidationError) return { ok: false, code: "validation", message: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of e.issues) (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
      return { ok: false, code: "validation", message: "Invalid input", fieldErrors };
    }
    console.error("Unexpected action error", e);
    return { ok: false, code: "unexpected", message: "Something went wrong" };
  }
}

export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || null;
}
