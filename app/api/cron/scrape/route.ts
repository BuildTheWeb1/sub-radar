import { NextRequest, NextResponse } from 'next/server'
import { scrapeChunk } from '@/lib/scraper'
import { sql } from '@/lib/db'
import type { Campaign } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60 // 60 seconds (Vercel Hobby max)

// Upper bound on subreddit x keyword pairs per campaign, per invocation. In practice
// scrapeChunk's own wall-clock time budget (see TIME_BUDGET_MS in scraper.ts) is what
// actually bounds a run — 15 is just a ceiling for the fast-path case. Empirically tuned
// on Vercel: 20 with no time budget caused real 504s once fetch() made runs fast enough
// to pull in more results (and therefore more sequential DB inserts below) than expected.
const MAX_PAIRS_PER_CAMPAIGN = 15

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
    // Oldest-scraped first. With MAX_CAMPAIGNS_PER_RUN capped at 1, an unordered
    // scan would let Postgres' heap order decide who gets served, and a campaign
    // could stay unpicked indefinitely while others are also due.
    campaigns = (await sql`
      SELECT * FROM campaigns
      WHERE (${targetCampaignId}::text IS NULL OR id = ${targetCampaignId})
        AND (${targetUserId}::text IS NULL OR user_id = ${targetUserId})
      ORDER BY last_scraped_at ASC NULLS FIRST
    `) as Campaign[]
  } catch (campaignError) {
    console.error('[cron] Failed to load campaigns:', campaignError)
  }

  if (!campaigns?.length) {
    return NextResponse.json({ error: 'No campaign found' }, { status: 404 })
  }

  // Scheduled runs only pick up campaigns that are "due": mid-cycle
  // (scrape_offset > 0), never scraped, or enough time elapsed per their frequency.
  //
  // A manual trigger is exempt. The user pressed "Run scan"; refusing because the
  // configured interval has not elapsed made the button a no-op that then reported
  // itself as a failed scan. The trigger route's own 10-minute rate limit is what
  // guards against abuse here, and it already ran before we got called.
  const isManualTrigger = Boolean(preCreatedJobId && targetCampaignId)
  const dueCampaigns = isManualTrigger ? campaigns : campaigns.filter(isCampaignDue)

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
          INSERT INTO scrape_jobs (user_id, campaign_id) VALUES (${userId}, ${campaign.id}) RETURNING *
        `) as { id: string }[]
        jobId = rows[0]?.id
      } catch (err) {
        console.error(`[cron] Failed to create job record for campaign ${campaign.id}:`, err)
      }
    }

    // Seed the job with where this cycle is resuming from, so the dashboard shows a
    // truthful cycle position from the first poll instead of jumping from 0 once the
    // first pair lands. `scrape_offset` is the cycle-wide cursor, not a per-run one.
    const pairsTotalEstimate = campaign.subreddits.length * campaign.keywords.length
    if (jobId) {
      try {
        await sql`
          UPDATE scrape_jobs
          SET pairs_total = ${pairsTotalEstimate}, pairs_done = ${campaign.scrape_offset}
          WHERE id = ${jobId}
        `
      } catch (err) {
        console.error(`[cron] Failed to seed progress for job ${jobId}:`, err)
      }
    }

    try {
      const { posts, nextOffset, cycleComplete, pairsTotal } = await scrapeChunk(
        campaign.subreddits,
        campaign.keywords,
        campaign.scrape_offset,
        MAX_PAIRS_PER_CAMPAIGN,
        (msg) => {
          console.log(`[${userId}/${campaign.id}] ${msg}`)
        },
        async ({ index, total, subreddit, keyword }) => {
          if (!jobId) return
          await sql`
            UPDATE scrape_jobs
            SET pairs_done = ${index}, pairs_total = ${total},
                current_subreddit = ${subreddit}, current_keyword = ${keyword}
            WHERE id = ${jobId}
          `
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
            SET finished_at = now(), posts_found = ${inserted}, pairs_total = ${pairsTotal},
                current_subreddit = NULL, current_keyword = NULL
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
            SET finished_at = now(), error_message = ${message},
                current_subreddit = NULL, current_keyword = NULL
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
