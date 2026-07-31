/**
 * A serverless invocation that dies mid-scrape (timeout, redeploy, crash) leaves
 * its scrape_jobs row with finished_at NULL forever — nothing else owns it. The
 * status endpoint sweeps those rows closed and stamps this marker on them.
 *
 * Two readers depend on the exact string: the dashboard renders "stopped early"
 * rather than "failed", and the trigger route's rate limit skips jobs carrying it,
 * so a job that never did any work cannot hold the ten-minute lock.
 */
export const STALLED_MARKER = 'stalled: scan stopped before it finished'

/**
 * How long a job may stay open before it is presumed dead. The cron function's own
 * ceiling is maxDuration = 60s, so anything still open well past that is not
 * running.
 */
export const STALL_AFTER_MS = 3 * 60 * 1000
