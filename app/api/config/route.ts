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

  // Validation
  const SUBREDDIT_RE = /^[a-zA-Z0-9_]{1,21}$/
  if (!Array.isArray(subreddits) || subreddits.length > 10) {
    return NextResponse.json({ error: 'Max 10 subreddits' }, { status: 400 })
  }
  if (subreddits.some((s: unknown) => typeof s !== 'string' || !SUBREDDIT_RE.test(s))) {
    return NextResponse.json({ error: 'Invalid subreddit name (letters, numbers, underscores, 1–21 chars)' }, { status: 400 })
  }
  if (!Array.isArray(keywords) || keywords.length > 20) {
    return NextResponse.json({ error: 'Max 20 keywords' }, { status: 400 })
  }
  if (keywords.some((k: unknown) => typeof k !== 'string' || k.length === 0 || k.length > 100)) {
    return NextResponse.json({ error: 'Each keyword must be 1–100 characters' }, { status: 400 })
  }
  if (typeof product_description !== 'string' || product_description.length > 2000) {
    return NextResponse.json({ error: 'product_description must be a string under 2000 characters' }, { status: 400 })
  }
  if (!['1h', '2h', '6h', '12h'].includes(scrape_frequency)) {
    return NextResponse.json({ error: 'Invalid scrape_frequency' }, { status: 400 })
  }
  if (typeof min_relevance !== 'number' || !Number.isFinite(min_relevance) || min_relevance < 0 || min_relevance > 100) {
    return NextResponse.json({ error: 'min_relevance must be a number between 0 and 100' }, { status: 400 })
  }

  try {
    const campaign = await getOrCreateCampaign(userId)
    const newName = typeof name === 'string' && name.trim() ? name : campaign.name

    const rows = (await sql`
      UPDATE campaigns
      SET
        name = ${newName},
        subreddits = ${subreddits}::text[],
        keywords = ${keywords}::text[],
        product_description = ${product_description},
        scrape_frequency = ${scrape_frequency},
        min_relevance = ${min_relevance},
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
