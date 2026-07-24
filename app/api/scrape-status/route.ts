import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'

const FREQUENCY_HOURS: Record<string, number> = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
}

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const campaign = await getOrCreateCampaign(userId)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [newCountRows, weekCountRows] = await Promise.all([
    sql`
      SELECT count(*)::int AS count FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND status = 'new'
    `,
    sql`
      SELECT count(*)::int AS count FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND scraped_at >= ${weekAgo}
    `,
  ])
  const newCount = (newCountRows as { count: number }[])[0]?.count ?? 0
  const weekCount = (weekCountRows as { count: number }[])[0]?.count ?? 0

  const frequency = campaign.scrape_frequency
  const frequencyHours = FREQUENCY_HOURS[frequency] ?? 2
  const lastScrapedAt = campaign.last_scraped_at ?? null
  const nextScrapeAt = lastScrapedAt
    ? new Date(new Date(lastScrapedAt).getTime() + frequencyHours * 60 * 60 * 1000).toISOString()
    : null

  return NextResponse.json({
    last_scraped_at: lastScrapedAt,
    next_scrape_at: nextScrapeAt,
    new_count: newCount ?? 0,
    week_count: weekCount ?? 0,
    frequency,
  })
}
