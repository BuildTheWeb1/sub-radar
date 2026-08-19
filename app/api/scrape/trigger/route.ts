import { NextRequest, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { scrapeCycleWorkflow } from '@/lib/workflows/scrape-cycle'
import type { Campaign } from '@/lib/types'

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  // Target campaign can come from the request body or a query param.
  let campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!campaignId) {
    try {
      const body = await req.json()
      campaignId = body?.campaignId ?? null
    } catch {
      // no JSON body provided — fall through to the missing-campaignId check below
    }
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  // Verify the campaign exists and belongs to this user.
  let campaign: Campaign | null = null
  try {
    const rows = (await sql`
      SELECT * FROM campaigns WHERE id = ${campaignId} AND user_id = ${userId}
    `) as Campaign[]
    campaign = rows[0] ?? null
  } catch (campaignError) {
    console.error('[trigger] Failed to look up campaign:', campaignError)
  }

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Block only while a scrape is genuinely in flight right now — NOT whenever
  // the campaign has a live self-perpetuating chain (active_run_id), which is
  // true almost all the time once a campaign is up and running (it stays set
  // across the chain's inter-cycle sleep). "Run scan" is meant to kick off an
  // ad-hoc pass even while the chain is alive but currently sleeping — that's
  // what chain=false below does: a one-shot run that doesn't touch the chain.
  let openJob: { id: string } | null = null
  try {
    const rows = (await sql`
      SELECT id FROM scrape_jobs WHERE campaign_id = ${campaignId} AND finished_at IS NULL LIMIT 1
    `) as { id: string }[]
    openJob = rows[0] ?? null
  } catch (err) {
    console.error('[trigger] Failed to check for an open job:', err)
  }

  if (openJob) {
    return NextResponse.json(
      { error: 'A scan is already running. Try again once it finishes.' },
      { status: 429 }
    )
  }

  // Check the balance up front so the failure is a clear, immediate error rather
  // than a workflow run that starts, deducts nothing, and pauses a moment later.
  const cost = campaign.subreddits.length * campaign.keywords.length
  if (cost > 0) {
    const balanceRows = (await sql`
      SELECT credit_balance FROM users WHERE id = ${userId}
    `) as { credit_balance: number }[]
    const balance = balanceRows[0]?.credit_balance ?? 0
    if (balance < cost) {
      return NextResponse.json(
        { error: `Not enough credits for this scan (need ${cost}, have ${balance}).` },
        { status: 402 }
      )
    }
  }

  // The caller has already confirmed credits are sufficient — clear any stale
  // pause from a previous cycle so the workflow's own paused_reason guard
  // doesn't skip this run before it gets a chance to re-check the balance.
  try {
    await sql`UPDATE campaigns SET paused_reason = NULL WHERE id = ${campaignId}`
  } catch (err) {
    console.error('[trigger] Failed to clear paused_reason:', err)
  }

  try {
    // chain: false — an ad-hoc, one-shot pass. It must not set/clear
    // active_run_id or re-enqueue itself, so it can run alongside (or entirely
    // independent of) whatever self-perpetuating chain this campaign already
    // has, without forking a second chain.
    await start(scrapeCycleWorkflow, [campaignId, false])
  } catch (err) {
    console.error('[trigger] Failed to start scrape workflow:', err)
    return NextResponse.json({ error: 'Failed to start scrape job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, started: true })
}
