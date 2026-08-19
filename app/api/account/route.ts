import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { sql } from '@/lib/db'

/**
 * Permanently deletes a user and everything they own. Only posts, config,
 * and credit_ledger are deleted explicitly — replies, scrape_jobs, and posts
 * tied to a campaign already cascade from the `campaigns` delete via FKs (see
 * db/schema.sql). The explicit deletes below exist for rows that predate
 * campaigns or were never linked to one (campaign_id NULL), which the
 * cascade can't reach.
 *
 * Also records the id in deleted_accounts before dropping the users row —
 * Google's providerAccountId is stable, so without a tombstone, signing in
 * again afterward would re-insert the same id and get the trial default
 * credit_balance for free. See lib/auth.ts's signIn callback and the
 * deleted_accounts comment in db/schema.sql.
 */
export async function DELETE() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    await sql.transaction([
      sql`INSERT INTO deleted_accounts (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`,
      sql`DELETE FROM campaigns WHERE user_id = ${userId}`,
      sql`DELETE FROM posts WHERE user_id = ${userId}`,
      sql`DELETE FROM scrape_jobs WHERE user_id = ${userId}`,
      sql`DELETE FROM config WHERE user_id = ${userId}`,
      sql`DELETE FROM credit_ledger WHERE user_id = ${userId}`,
      sql`DELETE FROM users WHERE id = ${userId}`,
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[account DELETE] Failed to delete account:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
