import { NextRequest, NextResponse } from 'next/server'
import { scrapeChunk } from '@/lib/scraper'
import { sql } from '@/lib/db'
import type { Campaign } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds (Vercel Hobby max)

// How many subreddit x keyword pairs to process per campaign, per invocation.
// Each pair now costs a headless-browser page navigation (~2-4s) instead of a
// plain fetch(), so 8 pairs keeps a single invocation safely under 50s.
const MAX_PAIRS_PER_CAMPAIGN = 8

// How many campaigns to process in a single invocation. Kept small so the total
// wall time (campaigns * pair-processing time) stays under ~50s.
const MAX_CAMPAIGNS_PER_RUN = 1

const FREQUENCY_HOURS: Record<string, number> = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
}

// A campaign is due for a fresh scrape cycle when it's mid-cycle (scrape_offset > 0,
// meaning a previous chunked run didn't finish), has never been scraped, or enough
// time has elapsed since its last completed scrape given its configured frequency.
function isCampaignDue(campaign: Campaign): boolean {
  if (campaign.scrape_offset > 0) return true
  if (!campaign.last_scraped_at) return true

  const frequencyHours = FREQUENCY_HOURS[campaign.scrape_frequency] ?? 2
  const elapsedMs = Date.now() - new Date(campaign.last_scraped_at).getTime()
  return elapsedMs >= frequencyHours * 60 * 60 * 1000
}

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron or the internal trigger
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Support targeting a specific campaign and/or user (from the manual trigger route)
  const targetCampaignId = req.nextUrl.searchParams.get('campaignId')
  const targetUserId = req.nextUrl.searchParams.get('userId')

  // Accept a pre-created jobId from the trigger route to avoid a duplicate insert
  // and close the rate-limit race condition. When called by Vercel Cron directly,
  // no jobId is provided and we create one per campaign as before.
  const preCreatedJobId = req.nextUrl.searchParams.get('jobId')

  // Load campaigns — either one campaign, one user's campaigns, or all campaigns.
  // Dynamic filter combos handled via NULL-safe predicates in a single query.
  let campaigns: Campaign[] = []
  try {
    campaigns = (await sql`
      SELECT * FROM campaigns
      WHERE (${targetCampaignId}::text IS NULL OR id = ${targetCampaignId})
        AND (${targetUserId}::text IS NULL OR user_id = ${targetUserId})
    `) as Campaign[]
  } catch (campaignError) {
    console.error('[cron] Failed to load campaigns:', campaignError)
  }

  if (!campaigns?.length) {
    return NextResponse.json({ error: 'No campaign found' }, { status: 404 })
  }

  // Only campaigns that are "due" get scraped this run: mid-cycle (scrape_offset > 0),
  // never scraped, or enough time elapsed since last_scraped_at per their frequency.
  // Campaigns that aren't due are simply skipped — not an error.
  const dueCampaigns = campaigns.filter(isCampaignDue)

  // If a manual trigger targeted a specific campaign that turned out not to be due,
  // close out its pre-created scrape_jobs row so the client's status polling
  // (which waits for finished_at) doesn't hang indefinitely.
  const notDueTargeted = campaigns.filter(
    (c) => !isCampaignDue(c) && preCreatedJobId && targetCampaignId === c.id
  )
  for (const campaign of notDueTargeted) {
    const frequencyHours = FREQUENCY_HOURS[campaign.scrape_frequency] ?? 2
    try {
      await sql`
        UPDATE scrape_jobs
        SET
          finished_at = now(),
          posts_found = 0,
          error_message = ${`Not due yet — next scrape available ${frequencyHours}h after the last completed scrape`}
        WHERE id = ${preCreatedJobId}
      `
    } catch (err) {
      console.error(`[cron] Failed to close out not-due job ${preCreatedJobId}:`, err)
    }
  }

  // Bound per-invocation time: only process a limited number of campaigns per run.
  const campaignsToRun = dueCampaigns.slice(0, MAX_CAMPAIGNS_PER_RUN)

  let totalInserted = 0

  for (const campaign of campaignsToRun) {
    const userId = campaign.user_id

    // Use the pre-created job record when available (manual trigger), otherwise
    // create a new one (Vercel Cron scheduled run).
    let jobId: string | undefined
    if (preCreatedJobId && targetCampaignId === campaign.id) {
      jobId = preCreatedJobId
    } else {
      try {
        const rows = (await sql`
          INSERT INTO scrape_jobs (user_id) VALUES (${userId}) RETURNING *
        `) as { id: string }[]
        jobId = rows[0]?.id
      } catch (err) {
        console.error(`[cron] Failed to create job record for campaign ${campaign.id}:`, err)
      }
    }

    try {
      const { posts, nextOffset, cycleComplete } = await scrapeChunk(
        campaign.subreddits,
        campaign.keywords,
        campaign.scrape_offset,
        MAX_PAIRS_PER_CAMPAIGN,
        (msg) => {
          console.log(`[${userId}/${campaign.id}] ${msg}`)
        }
      )

      let inserted = 0
      for (const post of posts) {
        if (post.relevance_score < campaign.min_relevance) continue

        try {
          const rows = (await sql`
            INSERT INTO posts (
              user_id, campaign_id, reddit_id, title, url, subreddit, author, body,
              upvotes, num_comments, relevance_score, posted_at
            ) VALUES (
              ${userId}, ${campaign.id}, ${post.reddit_id}, ${post.title}, ${post.url},
              ${post.subreddit}, ${post.author}, ${post.body}, ${post.upvotes},
              ${post.num_comments}, ${post.relevance_score}, ${post.posted_at}
            )
            ON CONFLICT (user_id, reddit_id) DO NOTHING
            RETURNING reddit_id
          `) as { reddit_id: string }[]
          if (rows.length > 0) inserted++
        } catch (err) {
          console.error(`[cron] Failed to upsert post ${post.reddit_id} for campaign ${campaign.id}:`, err)
        }
      }

      const nextLastScrapedAt = cycleComplete ? new Date().toISOString() : null

      try {
        if (cycleComplete) {
          await sql`
            UPDATE campaigns
            SET scrape_offset = ${nextOffset}, last_scraped_at = ${nextLastScrapedAt}
            WHERE id = ${campaign.id}
          `
        } else {
          await sql`
            UPDATE campaigns
            SET scrape_offset = ${nextOffset}
            WHERE id = ${campaign.id}
          `
        }
      } catch (err) {
        console.error(`[cron] Failed to update campaign ${campaign.id} after scrape:`, err)
      }

      if (jobId) {
        try {
          await sql`
            UPDATE scrape_jobs
            SET finished_at = now(), posts_found = ${inserted}
            WHERE id = ${jobId}
          `
        } catch (err) {
          console.error(`[cron] Failed to finalize job ${jobId} for campaign ${campaign.id}:`, err)
        }
      }

      totalInserted += inserted
    } catch (err) {
      const message = (err as Error).message
      console.error(`[cron] Scrape error for campaign ${campaign.id}:`, message)

      if (jobId) {
        try {
          await sql`
            UPDATE scrape_jobs
            SET finished_at = now(), error_message = ${message}
            WHERE id = ${jobId}
          `
        } catch (updateErr) {
          console.error(`[cron] Failed to record error for job ${jobId}:`, updateErr)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, posts_found: totalInserted })
}
