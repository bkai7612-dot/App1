import "server-only";
import { withDb, SYSTEM } from "@/lib/db";
import { tooMany } from "@/lib/server/errors";

/**
 * Fixed-window rate limiter backed by Postgres (shared across serverless instances).
 * Returns the current count; throws 429 when limit exceeded.
 */
export async function rateLimit(bucket: string, limit: number, windowSec: number): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSec * 1000)) * windowSec * 1000);
  const row = await withDb(SYSTEM, (tx) =>
    tx.one<{ count: number }>(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [bucket, windowStart],
    ),
  );
  const count = row?.count ?? 1;
  if (count > limit) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowSec * 1000 - now) / 1000);
    throw tooMany(retryAfter);
  }
  return count;
}

export async function peekRate(bucket: string, windowSec: number): Promise<number> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  const row = await withDb(SYSTEM, (tx) => tx.one<{ count: number }>(`SELECT count FROM rate_limits WHERE bucket = $1 AND window_start = $2`, [bucket, windowStart]));
  return row?.count ?? 0;
}
