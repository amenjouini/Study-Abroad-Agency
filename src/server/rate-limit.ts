import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by the database (works across instances).
 * The upsert is atomic, so concurrent requests cannot both slip under the limit.
 */
export async function rateLimit(key: string, opts: { limit: number; windowSeconds: number }): Promise<void> {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const fullKey = `app:${key}`;
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO rate_limits (id, key, count, "lastRequest")
    VALUES (${fullKey}, ${fullKey}, 1, ${BigInt(now)})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."lastRequest" < ${BigInt(now - windowMs)} THEN 1 ELSE rate_limits.count + 1 END,
      "lastRequest" = CASE WHEN rate_limits."lastRequest" < ${BigInt(now - windowMs)} THEN ${BigInt(now)} ELSE rate_limits."lastRequest" END
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > opts.limit) throw new RateLimitError();
}
