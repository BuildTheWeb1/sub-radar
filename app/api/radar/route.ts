import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { getGuidelinesForSubreddits } from '@/lib/guidelines'
import type { Campaign, SubredditGuideline } from '@/lib/types'

export const runtime = 'nodejs'
// getGuidelinesForSubreddits spaces uncached subreddits 2s apart.
export const maxDuration = 60

export interface RadarPayload {
  /** The whole campaign, so saving can round-trip the fields Radar doesn't edit. */
  campaign: Campaign
  guidelines: SubredditGuideline[]
  /** Posts stored per watched subreddit, so dead targets are visible as dead. */
  post_counts: Record<string, number>
}

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const campaign = await getOrCreateCampaign(userId)

  // One round trip for the whole page. Fetching targets, then guidelines, then
  // counts as three sequential client calls would stack three latencies before
  // anything renders.
  const [countRowsRaw, guidelines] = await Promise.all([
    sql`
      SELECT lower(subreddit) AS subreddit, count(*)::int AS count
      FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id}
      GROUP BY lower(subreddit)
    `,
    campaign.subreddits.length > 0
      ? getGuidelinesForSubreddits(campaign.subreddits).catch((err) => {
          console.error('[radar GET] Failed to load guidelines:', err)
          return [] as SubredditGuideline[]
        })
      : Promise.resolve([] as SubredditGuideline[]),
  ])

  const countRows = countRowsRaw as { subreddit: string; count: number }[]
  const postCounts: Record<string, number> = {}
  for (const row of countRows) {
    postCounts[row.subreddit] = row.count
  }

  const payload: RadarPayload = {
    campaign,
    guidelines,
    post_counts: postCounts,
  }

  return NextResponse.json(payload)
}
