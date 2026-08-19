import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import type { ScrapeStatus } from '@/lib/types'

interface JobRow {
  id: string
  started_at: string
  finished_at: string | null
  posts_found: number
  error_message: string | null
  pairs_total: number
  pairs_done: number
  current_subreddit: string | null
  current_keyword: string | null
}

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const campaign = await getOrCreateCampaign(userId)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [newCountRows, weekCountRows, openJobRows, lastJobRows] = await Promise.all([
    sql`
      SELECT count(*)::int AS count FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND status = 'new'
    `,
    sql`
      SELECT count(*)::int AS count FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND scraped_at >= ${weekAgo}
    `,
    sql`
      SELECT * FROM scrape_jobs
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND finished_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `,
    sql`
      SELECT * FROM scrape_jobs
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id} AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `,
  ])

  const newCount = (newCountRows as { count: number }[])[0]?.count ?? 0
  const weekCount = (weekCountRows as { count: number }[])[0]?.count ?? 0
  const openJob = (openJobRows as JobRow[])[0] ?? null
  const lastJob = (lastJobRows as JobRow[])[0] ?? null

  // "Running" means a scrape is actively in flight right now, answered by an
  // open scrape_jobs row — NOT by campaign.active_run_id, which means "this
  // campaign has a live, self-perpetuating scan chain" and stays set across
  // the chain's inter-cycle sleep (most of the time, for a healthy campaign).
  // Conflating the two used to make the dashboard permanently show "running".
  const running = Boolean(openJob)

  // The old cron-based scraper's stall sweep (a job open past a fixed timeout got
  // stamped "stalled") doesn't have a workflow-native equivalent: a run's
  // event log is the SDK's own concern, and there's no cheap "is this run
  // actually still alive" check available here without querying the SDK's own
  // run-status API per poll. A dead chain run is no longer a silent, permanent
  // lockout though — scrapeCycleWorkflow's own failure handling
  // (markRunFailedStep) clears active_run_id and stamps error_message /
  // next_run_at on a genuine failure, so it surfaces via last_error below and
  // the reconcile cron picks the campaign back up on its next pass. This field
  // is left hard-coded false for now rather than inventing a new heuristic on
  // top of that.
  const stalled = false

  const status: ScrapeStatus = {
    running,
    stalled,
    last_scraped_at: campaign.last_scraped_at,
    next_scrape_at: campaign.next_run_at,
    cadence: `every ${campaign.scrape_frequency}`,
    pairs_done: running ? (openJob?.pairs_done ?? 0) : 0,
    pairs_total: running
      ? openJob?.pairs_total || campaign.subreddits.length * campaign.keywords.length || 0
      : 0,
    current_subreddit: running ? openJob?.current_subreddit ?? null : null,
    current_keyword: running ? openJob?.current_keyword ?? null : null,
    last_posts_found: lastJob?.posts_found ?? 0,
    last_finished_at: lastJob?.finished_at ?? null,
    last_error: lastJob?.error_message ?? null,
    new_count: newCount,
    week_count: weekCount,
    frequency: campaign.scrape_frequency,
    paused_reason: campaign.paused_reason,
  }

  return NextResponse.json(status)
}
