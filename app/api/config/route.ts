import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
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

    // scrape_offset is a cursor into the subreddit x keyword pair list. Changing
    // either array changes that list's length and ordering, which makes the stored
    // offset meaningless — scrapeChunk would wrap it modulo the new length and
    // resume at an arbitrary position, skipping every pair before it and then
    // declaring the cycle complete. Restart the cycle instead.
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

    return NextResponse.json(data)
  } catch (err) {
    console.error('[config POST] Failed to update campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
