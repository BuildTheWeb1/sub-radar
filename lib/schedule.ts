/**
 * The cadence at which the deployed platform actually invokes /api/cron/scrape.
 *
 * vercel.json requests `0 * * * *` (hourly), but Vercel's Hobby plan coerces every
 * cron to a single daily invocation regardless of the expression. A campaign's
 * `scrape_frequency` therefore can't promise more than the platform delivers: a
 * campaign set to "every 1 hour" on Hobby still only gets picked up once a day.
 *
 * Rather than quietly showing a "next scrape" time that will never happen, we take
 * the deployed cadence from the environment and clamp the estimate against it. Set
 * SCRAPE_CRON_INTERVAL_MINUTES=1440 on Hobby, 60 on Pro.
 */
const DEFAULT_INTERVAL_MINUTES = 60

export const CRON_INTERVAL_MINUTES: number = (() => {
  const raw = Number(process.env.SCRAPE_CRON_INTERVAL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MINUTES
})()

/**
 * The next wall-clock moment the platform's cron will fire, assuming a fixed
 * interval anchored to the epoch. An estimate: Vercel does not publish the exact
 * next-tick time.
 *
 * The anchoring assumption holds for `0 * * * *`, whose ticks land on the hour. It
 * does NOT hold for a daily Hobby cron, which fires at an unspecified time of day
 * — there this predicts midnight UTC and can be off by up to a day. Callers must
 * pass a `from` no earlier than now, or the returned tick will be in the past.
 */
export function nextCronTick(from: Date = new Date()): Date {
  const intervalMs = CRON_INTERVAL_MINUTES * 60 * 1000
  return new Date(Math.ceil(from.getTime() / intervalMs) * intervalMs)
}

/** Human-readable cadence for the UI, e.g. "every hour", "once a day". */
export function describeCronCadence(): string {
  if (CRON_INTERVAL_MINUTES >= 1440) return 'once a day'
  if (CRON_INTERVAL_MINUTES === 60) return 'every hour'
  if (CRON_INTERVAL_MINUTES % 60 === 0) return `every ${CRON_INTERVAL_MINUTES / 60} hours`
  return `every ${CRON_INTERVAL_MINUTES} minutes`
}
