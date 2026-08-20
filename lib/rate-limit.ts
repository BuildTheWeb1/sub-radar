import 'server-only'
import { sql } from '@/lib/db'

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

/**
 * Fixed-window rate limiter backed by Postgres, not a new Redis/Upstash
 * dependency — this app had zero request-rate ceiling anywhere before this
 * (see the security review that added it), so a table this app already has
 * a connection to is enough to close that gap without new infrastructure.
 *
 * One atomic UPSERT per call: a window that has expired resets to count=1,
 * otherwise the count increments — race-safe under concurrent calls with the
 * same key because the whole thing is one statement, the same pattern
 * lib/credits.ts uses for atomic balance updates.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const rows = (await sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start <= now() - (${windowSeconds} || ' seconds')::interval THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start <= now() - (${windowSeconds} || ' seconds')::interval THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `) as { count: number; window_start: string }[]

  const { count, window_start } = rows[0]
  const elapsedSeconds = (Date.now() - new Date(window_start).getTime()) / 1000
  const retryAfterSeconds = Math.max(0, Math.ceil(windowSeconds - elapsedSeconds))
  return { ok: count <= limit, retryAfterSeconds }
}
