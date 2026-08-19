import { NextRequest, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { scrapeCycleWorkflow } from '@/lib/workflows/scrape-cycle'
import type { Campaign } from '@/lib/types'

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const campaign = await getOrCreateCampaign(userId)
    return NextResponse.json(campaign)
  } catch (err) {
    console.error('[config GET] Failed to load/create campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const body = await req.json()
  const { name, subreddits, keywords, product_description, scrape_frequency, min_relevance } = body

  // Partial update: only the keys actually present in the body are written.
  //
  // Radar and Settings each edit a different slice of the campaign, and both used
  // to POST the whole object, sourcing the fields they don't own from a snapshot
  // taken when the page loaded. A Settings tab left open overnight would happily
  // overwrite subreddits added on Radar in the meantime, and report success. Only
  // sending what you changed removes that class of loss entirely.
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)

  const SUBREDDIT_RE = /^[a-zA-Z0-9_]{1,21}$/
  if (has('subreddits')) {
    if (!Array.isArray(subreddits) || subreddits.length > 10) {
      return NextResponse.json({ error: 'Max 10 subreddits' }, { status: 400 })
    }
    if (subreddits.some((s: unknown) => typeof s !== 'string' || !SUBREDDIT_RE.test(s))) {
      return NextResponse.json({ error: 'Invalid subreddit name (letters, numbers, underscores, 1–21 chars)' }, { status: 400 })
    }
  }
  if (has('keywords')) {
    if (!Array.isArray(keywords) || keywords.length > 20) {
      return NextResponse.json({ error: 'Max 20 keywords' }, { status: 400 })
    }
    if (keywords.some((k: unknown) => typeof k !== 'string' || k.length === 0 || k.length > 100)) {
      return NextResponse.json({ error: 'Each keyword must be 1–100 characters' }, { status: 400 })
    }
  }
  if (has('product_description')) {
    if (typeof product_description !== 'string' || product_description.length > 2000) {
      return NextResponse.json({ error: 'product_description must be a string under 2000 characters' }, { status: 400 })
    }
  }
  if (has('scrape_frequency') && !['1h', '2h', '6h', '12h'].includes(scrape_frequency)) {
    return NextResponse.json({ error: 'Invalid scrape_frequency' }, { status: 400 })
  }
  if (has('min_relevance')) {
    if (typeof min_relevance !== 'number' || !Number.isFinite(min_relevance) || min_relevance < 0 || min_relevance > 100) {
      return NextResponse.json({ error: 'min_relevance must be a number between 0 and 100' }, { status: 400 })
    }
  }

  try {
    const campaign = await getOrCreateCampaign(userId)
    const newName = typeof name === 'string' && name.trim() ? name : campaign.name

    const nextSubreddits = has('subreddits') ? (subreddits as string[]) : campaign.subreddits
    const nextKeywords = has('keywords') ? (keywords as string[]) : campaign.keywords

    // scrape_offset is a legacy cursor from the retired chunked-cron scraper.
    // Nothing reads it anymore, but it's reset alongside targetsChanged below so
    // a rollback wouldn't inherit a cursor pointing at the wrong pair list.
    const targetsChanged =
      JSON.stringify(nextSubreddits) !== JSON.stringify(campaign.subreddits) ||
      JSON.stringify(nextKeywords) !== JSON.stringify(campaign.keywords)

    const rows = (await sql`
      UPDATE campaigns
      SET
        name = ${newName},
        subreddits = ${nextSubreddits}::text[],
        keywords = ${nextKeywords}::text[],
        product_description = ${
          has('product_description') ? product_description : campaign.product_description
        },
        scrape_frequency = ${
          has('scrape_frequency') ? scrape_frequency : campaign.scrape_frequency
        },
        min_relevance = ${has('min_relevance') ? min_relevance : campaign.min_relevance},
        scrape_offset = ${targetsChanged ? 0 : campaign.scrape_offset},
        updated_at = now()
      WHERE id = ${campaign.id} AND user_id = ${userId}
      RETURNING *
    `) as Campaign[]
    const data = rows[0] ?? null

    if (!data) {
      console.error('[config POST] Failed to update campaign: no row matched (id/user_id mismatch)')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Changing targets invalidates whatever scan cycle is in flight — get the
    // campaign scanning against what was actually just saved, not the snapshot
    // the current run picked up. This is also what fires the first-ever scan
    // when onboarding saves targets for the first time, since that always
    // flows through this same POST /api/config path.
    if (targetsChanged && data.subreddits.length > 0 && data.keywords.length > 0) {
      try {
        // The user just chose to (re)watch these targets — clear any stale
        // pause from a previous cycle so the workflow's own guard doesn't skip
        // the run below before it gets to re-check the credit balance.
        await sql`UPDATE campaigns SET paused_reason = NULL WHERE id = ${data.id}`

        if (!data.active_run_id) {
          // No live chain yet (first save, or a previous chain died/paused) —
          // start one. chain: true means this run holds active_run_id and
          // re-enqueues itself after each cycle.
          await start(scrapeCycleWorkflow, [data.id, true])
        } else {
          // A chain is already alive and will naturally pick up these new
          // targets on its next cycle (it reloads the campaign row fresh each
          // time) — but that could be hours away. Kick an immediate ad-hoc
          // pass with the new targets instead, without disturbing the
          // persistent chain. Guarded on there being no open job already, so
          // a rapid double-save can't pile up concurrent ad-hoc runs.
          const openRows = (await sql`
            SELECT id FROM scrape_jobs WHERE campaign_id = ${data.id} AND finished_at IS NULL LIMIT 1
          `) as { id: string }[]
          if (openRows.length === 0) {
            await start(scrapeCycleWorkflow, [data.id, false])
          }
        }
      } catch (err) {
        console.error('[config POST] Failed to start scan cycle:', err)
      }
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[config POST] Failed to update campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
