import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, UnauthenticatedError, ValidationError } from "@/lib/errors";

export function jsonError(e: unknown): NextResponse {
  if (e instanceof UnauthenticatedError) return NextResponse.json({ error: "unauthenticated", message: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden", message: e.message }, { status: 403 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: "not_found", message: e.message }, { status: 404 });
  if (e instanceof RateLimitError) return NextResponse.json({ error: "rate_limited", message: e.message }, { status: 429 });
  if (e instanceof ConflictError) return NextResponse.json({ error: "conflict", message: e.message }, { status: 409 });
  if (e instanceof ValidationError) return NextResponse.json({ error: "validation", message: e.message, fieldErrors: e.fieldErrors }, { status: 422 });
  if (e instanceof ZodError) return NextResponse.json({ error: "validation", message: "Invalid input" }, { status: 422 });
  console.error("Unexpected API error", e);
  return NextResponse.json({ error: "unexpected", message: "Something went wrong" }, { status: 500 });
}

/** CSRF defence for cookie-authenticated mutations: the request must come from our own origin. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) throw new ForbiddenError("Missing origin");
  if (new URL(origin).host !== host) throw new ForbiddenError("Cross-origin request refused");
}

export function requestIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || null;
}
