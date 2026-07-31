import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { nextCronTick, describeCronCadence } from '@/lib/schedule'
import { STALLED_MARKER, STALL_AFTER_MS } from '@/lib/scrape-jobs'
import type { ScrapeStatus } from '@/lib/types'

const FREQUENCY_HOURS: Record<string, number> = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
}


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

  // Close out this user's dead jobs before reading anything. Nothing else ever
  // finishes them: the invocation that owned the row is gone. Left open, the
  // newest-open-job lookup below would keep returning the same corpse after every
  // later scan succeeded, pinning the dashboard to a permanent "stopped early"
  // warning while scraping was in fact working.
  const stallCutoff = new Date(Date.now() - STALL_AFTER_MS).toISOString()
  try {
    await sql`
      UPDATE scrape_jobs
      SET finished_at = now(), error_message = ${STALLED_MARKER},
          current_subreddit = NULL, current_keyword = NULL
      WHERE user_id = ${userId} AND finished_at IS NULL AND started_at < ${stallCutoff}
    `
  } catch (err) {
    console.error('[scrape-status] Failed to sweep stalled jobs:', err)
  }

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
      WHERE user_id = ${userId} AND finished_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `,
    sql`
      SELECT * FROM scrape_jobs
      WHERE user_id = ${userId} AND finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `,
  ])

  const newCount = (newCountRows as { count: number }[])[0]?.count ?? 0
  const weekCount = (weekCountRows as { count: number }[])[0]?.count ?? 0
  const openJob = (openJobRows as JobRow[])[0] ?? null
  const lastJob = (lastJobRows as JobRow[])[0] ?? null

  // After the sweep, any job still open started within the stall window, so it is
  // genuinely running. "Stalled" is now a property of the most recent finished
  // job, which ages out naturally as soon as a later scan completes.
  const running = Boolean(openJob)
  const stalled = !running && lastJob?.error_message === STALLED_MARKER

  const frequency = campaign.scrape_frequency
  const frequencyHours = FREQUENCY_HOURS[frequency] ?? 2
  const lastScrapedAt = campaign.last_scraped_at ?? null

  // When the campaign is due is only half the answer: nothing happens until the
  // platform's cron actually fires. Report the later of the two so the countdown
  // never promises a scrape earlier than one can physically occur.
  // The tick has to be measured forward from *now*, not from the due time: an
  // overdue campaign has a due time in the past, and rounding up from a past
  // moment yields a past tick — which the UI would render as "next 3 hours ago".
  let nextScrapeAt: string | null = null
  if (lastScrapedAt) {
    const now = new Date()
    const dueAt = new Date(new Date(lastScrapedAt).getTime() + frequencyHours * 60 * 60 * 1000)
    nextScrapeAt = nextCronTick(dueAt > now ? dueAt : now).toISOString()
  } else {
    nextScrapeAt = nextCronTick().toISOString()
  }

  // Mid-cycle, the campaign cursor is the authority on how far the cycle got —
  // it survives across invocations, whereas a finished job row only describes
  // the chunk it personally ran.
  const pairsTotal =
    openJob?.pairs_total ||
    campaign.subreddits.length * campaign.keywords.length ||
    0
  const pairsDone = openJob
    ? openJob.pairs_done
    : campaign.scrape_offset > 0
      ? campaign.scrape_offset
      : 0

  const status: ScrapeStatus = {
    running,
    stalled,
    last_scraped_at: lastScrapedAt,
    next_scrape_at: nextScrapeAt,
    cadence: describeCronCadence(),
    pairs_done: pairsDone,
    pairs_total: pairsTotal,
    current_subreddit: running ? openJob?.current_subreddit ?? null : null,
    current_keyword: running ? openJob?.current_keyword ?? null : null,
    last_posts_found: lastJob?.posts_found ?? 0,
    last_finished_at: lastJob?.finished_at ?? null,
    last_error: lastJob?.error_message ?? null,
    new_count: newCount,
    week_count: weekCount,
    frequency,
  }

  return NextResponse.json(status)
}
