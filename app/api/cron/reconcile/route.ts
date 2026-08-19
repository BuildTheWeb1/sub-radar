import { NextRequest, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { sql } from '@/lib/db'
import { scrapeCycleWorkflow } from '@/lib/workflows/scrape-cycle'
import type { Campaign } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Safety net, not the primary scheduler. Each scan cycle is supposed to
 * re-enqueue itself (see lib/workflows/scrape-cycle.ts's sleep-then-start tail),
 * so under normal operation this finds nothing to do. It exists for two cases
 * a healthy chain wouldn't otherwise recover from on its own:
 *
 *  1. A chain died — a step exhausted its retries, a deploy landed mid-sleep,
 *     the SDK's queue dropped an enqueue, etc. — leaving active_run_id cleared
 *     (see markRunFailedStep) and next_run_at in the past with no run coming
 *     to honor it.
 *  2. A campaign is paused for insufficient credits, and the user's balance is
 *     sufficient again. Nothing else re-checks a paused campaign — the
 *     workflow's own paused_reason guard means a chain never resumes itself,
 *     and the only other callers that clear paused_reason (the trigger and
 *     config routes) require the user to take an action first.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let started = 0
  let recovered = 0

  // Case 1: due campaigns with no live chain and no pause in the way. next_run_at
  // IS NULL is treated as due too — a chain that died before ever completing a
  // cycle (see markRunFailedStep's null-jobId path) never got to set it.
  let due: Campaign[] = []
  try {
    due = (await sql`
      SELECT * FROM campaigns
      WHERE (next_run_at IS NULL OR next_run_at < now())
        AND active_run_id IS NULL
        AND paused_reason IS NULL
    `) as Campaign[]
  } catch (err) {
    console.error('[reconcile] Failed to load due campaigns:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  for (const campaign of due) {
    try {
      await start(scrapeCycleWorkflow, [campaign.id, true])
      started++
    } catch (err) {
      console.error(`[reconcile] Failed to start cycle for campaign ${campaign.id}:`, err)
    }
  }

  // Case 2: campaigns paused for insufficient credits whose balance has since
  // recovered (a top-up, a plan change, etc. — this app has no such flow yet,
  // but the recovery path should not depend on the user doing anything).
  let paused: (Campaign & { credit_balance: number })[] = []
  try {
    paused = (await sql`
      SELECT c.*, u.credit_balance
      FROM campaigns c
      JOIN users u ON u.id = c.user_id
      WHERE c.paused_reason = 'insufficient_credits' AND c.active_run_id IS NULL
    `) as (Campaign & { credit_balance: number })[]
  } catch (err) {
    console.error('[reconcile] Failed to load paused campaigns:', err)
    return NextResponse.json({ ok: true, started, recovered })
  }

  for (const campaign of paused) {
    const cost = campaign.subreddits.length * campaign.keywords.length
    if (campaign.credit_balance < cost) continue

    try {
      await sql`UPDATE campaigns SET paused_reason = NULL WHERE id = ${campaign.id}`
      await start(scrapeCycleWorkflow, [campaign.id, true])
      recovered++
    } catch (err) {
      console.error(`[reconcile] Failed to resume paused campaign ${campaign.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, started, recovered, checked: due.length + paused.length })
}
