import { sql } from './db'

/**
 * Leads (scraped posts) found this calendar month, across every campaign the
 * user has. Counted by scraped_at — when our system found the post — not
 * posted_at, which is when it went up on Reddit and can predate the scan
 * that surfaced it.
 */
export async function getLeadsThisMonth(userId: string): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS count FROM posts
    WHERE user_id = ${userId}
      AND scraped_at >= date_trunc('month', now())
  `) as { count: number }[]
  return rows[0]?.count ?? 0
}
