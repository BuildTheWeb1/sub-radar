import { sleep, getWorkflowMetadata, getStepMetadata } from 'workflow'
import { start } from 'workflow/api'
import { sql } from '@/lib/db'
import { deductCredits } from '@/lib/credits'
import { buildPairs, scrapeOnePair } from '@/lib/scraper'
import type { Campaign } from '@/lib/types'

const FREQUENCY_HOURS: Record<string, number> = {
  '1h': 1,
  '2h': 2,
  '6h': 6,
  '12h': 12,
}

async function loadCampaignStep(campaignId: string): Promise<Campaign | null> {
  'use step'
  const rows = (await sql`SELECT * FROM campaigns WHERE id = ${campaignId}`) as Campaign[]
  return rows[0] ?? null
}

/**
 * Cost = subreddits x keywords, charged up front for the whole cycle. Uses this
 * step's own stepId as the credit_ledger idempotency key (see
 * lib/credits.ts and credit_ledger_scan_cycle_ref_id_idx in db/schema.sql) so a
 * retry after a lost response can't double-charge.
 */
async function deductCycleCreditsStep(campaign: Campaign): Promise<boolean> {
  'use step'
  const cost = campaign.subreddits.length * campaign.keywords.length
  if (cost <= 0) return true // Nothing to scan — don't block an empty campaign on credits.
  const { stepId } = getStepMetadata()
  const result = await deductCredits(campaign.user_id, cost, 'scan_cycle', stepId)
  return result.ok
}

async function pauseCampaignStep(campaignId: string): Promise<void> {
  'use step'
  // Pausing ends the chain: a sleeping chain run that wakes up later will see
  // paused_reason set and stop itself (see the guard at the top of
  // scrapeCycleWorkflow), and active_run_id is cleared so nothing treats this
  // campaign as having a live chain in the meantime.
  await sql`
    UPDATE campaigns SET paused_reason = 'insufficient_credits', active_run_id = NULL
    WHERE id = ${campaignId}
  `
}

/**
 * Marks the cycle as in-flight. For chain runs, sets active_run_id to this
 * workflow run's id — active_run_id means "this campaign has a live,
 * self-perpetuating scan chain", and (unlike scrape_jobs) is NOT cleared at the
 * end of a normal cycle; it persists across the inter-cycle sleep so callers
 * can tell a chain apart from an idle campaign. Ad-hoc (non-chain) runs leave
 * it untouched.
 *
 * Also opens (or reuses, on retry) a scrape_jobs row so
 * /api/scrape-status's "an open row means running" contract keeps working for
 * the ScraperBar. The insert upserts on scrape_jobs_open_per_campaign_idx so a
 * retried step reuses the same row instead of orphaning a duplicate.
 */
async function markRunStartedStep(campaign: Campaign, chainRunId: string | null): Promise<string> {
  'use step'
  if (chainRunId) {
    await sql`UPDATE campaigns SET active_run_id = ${chainRunId} WHERE id = ${campaign.id}`
  }
  const pairsTotal = campaign.subreddits.length * campaign.keywords.length
  const rows = (await sql`
    INSERT INTO scrape_jobs (user_id, campaign_id, pairs_total)
    VALUES (${campaign.user_id}, ${campaign.id}, ${pairsTotal})
    ON CONFLICT (campaign_id) WHERE finished_at IS NULL
      DO UPDATE SET pairs_total = EXCLUDED.pairs_total
    RETURNING id
  `) as { id: string }[]
  return rows[0].id
}

async function scrapePairStep(
  campaign: Campaign,
  subreddit: string,
  keyword: string,
  jobId: string,
  index: number,
  total: number
) {
  'use step'
  return scrapeOnePair(campaign, subreddit, keyword, jobId, index, total)
}

/** Closes the scrape_jobs row and schedules the next cycle. Never touches active_run_id — see markRunStartedStep. */
async function markRunFinishedStep(
  campaign: Campaign,
  jobId: string,
  totalInserted: number
): Promise<string> {
  'use step'
  await sql`
    UPDATE scrape_jobs
    SET finished_at = now(), posts_found = ${totalInserted},
        current_subreddit = NULL, current_keyword = NULL
    WHERE id = ${jobId}
  `

  const frequencyHours = FREQUENCY_HOURS[campaign.scrape_frequency] ?? 2
  const rows = (await sql`
    UPDATE campaigns
    SET last_scraped_at = now(), scrape_offset = 0,
        next_run_at = now() + (${frequencyHours} || ' hours')::interval
    WHERE id = ${campaign.id}
    RETURNING next_run_at
  `) as { next_run_at: string }[]

  return rows[0].next_run_at
}

/**
 * Records a run that died (a step exhausted its retries) so it degrades to
 * "idle, will retry next reconcile pass" instead of silently wedging forever.
 * For chain runs, clears active_run_id (the chain is dead — nothing will
 * self-restart it) and stamps next_run_at = now() so the reconcile cron picks
 * it back up on its next pass rather than waiting for a next_run_at that may
 * never have been set.
 */
async function markRunFailedStep(
  campaignId: string,
  jobId: string | null,
  chain: boolean,
  message: string
): Promise<void> {
  'use step'
  if (jobId) {
    await sql`
      UPDATE scrape_jobs
      SET finished_at = now(), error_message = ${message.slice(0, 500)},
          current_subreddit = NULL, current_keyword = NULL
      WHERE id = ${jobId}
    `
  }
  if (chain) {
    await sql`
      UPDATE campaigns SET active_run_id = NULL, next_run_at = now() WHERE id = ${campaignId}
    `
  }
}

/**
 * start() can't be called directly from workflow-sandbox code — it must run
 * inside a step, which has full Node.js/network access.
 */
async function startNextCycleStep(campaignId: string): Promise<void> {
  'use step'
  await start(scrapeCycleWorkflow, [campaignId, true])
}

/**
 * One bounded workflow run per scan cycle. Deliberately does NOT loop forever
 * inside a single run — at the end of a cycle it sleeps until next_run_at and
 * then explicitly enqueues a fresh run for the same campaign, so each run has a
 * clear start/end and the event log a single run accumulates stays bounded.
 *
 * `chain` distinguishes two kinds of invocation:
 *  - chain = true: part of the campaign's self-perpetuating schedule (started
 *    by the config route on first save, or by the reconcile cron's safety
 *    net). Sets/holds active_run_id for the campaign's whole lifetime as a
 *    chain, and re-enqueues itself after sleeping until next_run_at.
 *  - chain = false: a one-off ad-hoc pass (the manual "Run scan" button, or a
 *    config save that changed targets while a chain is already alive). Does
 *    NOT touch active_run_id and does NOT re-enqueue itself — it runs once and
 *    stops. This is what lets a manual scan run immediately without racing or
 *    duplicating the campaign's persistent chain.
 *
 * Callers are expected to have already cleared campaign.paused_reason when
 * they decide it's safe to start a new run (e.g. the user's credit balance is
 * sufficient again) — this function's own paused_reason check is a defensive
 * guard against a stale/duplicate enqueue racing a pause, not the mechanism
 * that un-pauses a campaign.
 */
export async function scrapeCycleWorkflow(campaignId: string, chain: boolean) {
  'use workflow'

  const campaign = await loadCampaignStep(campaignId)
  if (!campaign || campaign.paused_reason) {
    return { status: 'skipped' as const }
  }

  // jobId is only assigned once markRunStartedStep succeeds — the single
  // try/catch below covers every step from here on (crediting, opening the
  // job, scraping, closing out), so a failure anywhere in that sequence lands
  // in one place and can tell whether a job row exists yet to close out.
  let jobId: string | null = null
  try {
    const granted = await deductCycleCreditsStep(campaign)
    if (!granted) {
      await pauseCampaignStep(campaignId)
      return { status: 'paused' as const }
    }

    const { workflowRunId } = getWorkflowMetadata()
    jobId = await markRunStartedStep(campaign, chain ? workflowRunId : null)

    const pairs = buildPairs(campaign.subreddits, campaign.keywords)
    let totalInserted = 0
    let index = 0
    for (const { subreddit, keyword } of pairs) {
      index++
      const result = await scrapePairStep(campaign, subreddit, keyword, jobId, index, pairs.length)
      totalInserted += result.inserted
      await sleep('1.5s')
    }

    const nextRunAt = await markRunFinishedStep(campaign, jobId, totalInserted)

    if (chain) {
      await sleep(new Date(nextRunAt))
      await startNextCycleStep(campaignId)
    }

    return { status: 'complete' as const }
  } catch (err) {
    // Whatever failed — crediting, opening the job, a pair, closing out, or
    // even the final re-enqueue — degrade to "idle, will retry next reconcile
    // pass" rather than leaving the campaign permanently wedged as "has a live
    // chain" with nothing left to actually run it. See markRunFailedStep.
    await markRunFailedStep(campaignId, jobId, chain, (err as Error).message)
    return { status: 'failed' as const }
  }
}
