import 'server-only'
import { sql } from '@/lib/db'
import type { SubredditGuideline, SubredditCheck } from '@/lib/types'
import { fetchRedditJson, RedditHttpError } from '@/lib/reddit-http'

// Delay between subs that require a fresh network fetch, to avoid hammering
// Reddit back-to-back when several subs need fetching in one call.
const INTER_SUBREDDIT_DELAY_MS = 2000
const CACHE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface RedditAboutResponse {
  data?: {
    public_description?: string
    subscribers?: number
    submission_type?: string
    subreddit_type?: string
  }
}

interface RedditRule {
  short_name?: string
  description?: string
}

interface RedditRulesResponse {
  rules?: RedditRule[]
}

// Phrases that indicate self-promotion / links are outright disallowed.
const STRONG_BAN_PATTERNS: RegExp[] = [
  /no self[\s-]?promo(?:tion)?/i,
  /self[\s-]?promotion is not allowed/i,
  /no advertising/i,
  /no promotion/i,
  /no links/i,
  /spam will be/i,
]

// Phrases that indicate self-promotion is allowed but rate/ratio limited.
const LIMIT_PATTERNS: RegExp[] = [
  /9\s*:\s*1/,
  /1\s*in\s*10/i,
  /1\s*:\s*10/,
  /limited self[\s-]?promotion/i,
  /self[\s-]?promotion allowed/i,
  /occasional/i,
  /flair required/i,
  /must participate/i,
]

// Phrases specifically indicating links are banned (used for links_allowed).
const LINK_BAN_PATTERNS: RegExp[] = [/no links/i, /links? (?:are )?not allowed/i, /no external links/i]

function buildRulesFromResponse(rulesRes: RedditRulesResponse): { title: string; description: string }[] {
  if (!Array.isArray(rulesRes.rules)) return []
  return rulesRes.rules.map((r) => ({
    title: r.short_name ?? '',
    description: r.description ?? '',
  }))
}

function extractMinKarma(text: string): number | null {
  const match = text.match(/(\d+)\s*\+?\s*karma/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return Number.isFinite(value) ? value : null
}

function extractMinAccountAgeDays(text: string): number | null {
  const match = text.match(/(\d+)\s*\+?\s*day(?:s)?\s*(?:old|account)/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return Number.isFinite(value) ? value : null
}

function findCadenceNote(
  rules: { title: string; description: string }[],
  combinedText: string
): string | null {
  for (const rule of rules) {
    const ruleText = `${rule.title} ${rule.description}`.toLowerCase()
    if (LIMIT_PATTERNS.some((p) => p.test(ruleText))) {
      return rule.title || 'Self-promotion limit'
    }
  }
  if (LIMIT_PATTERNS.some((p) => p.test(combinedText))) {
    return 'Self-promotion limit mentioned in subreddit description'
  }
  return null
}

function safeFallback(subreddit: string): SubredditGuideline {
  return {
    subreddit: subreddit.toLowerCase(),
    self_promo_policy: 'unknown',
    links_allowed: false,
    min_karma: null,
    min_account_age_days: null,
    cadence_note: null,
    risk: 'unknown',
    rules: [],
    subscribers: null,
    public_description: null,
    fetched_at: new Date().toISOString(),
  }
}

/**
 * The fetching half of fetchSubredditGuideline, kept separate because it lets
 * the error through. Existence checks need to tell a 404 apart from a network
 * failure, which the swallow-everything wrapper below makes impossible.
 */
async function fetchSubredditGuidelineOrThrow(subreddit: string): Promise<SubredditGuideline> {
  const sub = subreddit.toLowerCase()

  {
    const about = await fetchRedditJson<RedditAboutResponse>(`/r/${sub}/about.json`)
    // Reddit answers 200 with an empty payload for some banned/deleted subreddits
    // rather than 404, so an absent `data` is treated as "not there".
    if (!about.data) {
      throw new RedditHttpError(`No such subreddit: ${sub}`, 404)
    }
    const rulesRes = await fetchRedditJson<RedditRulesResponse>(`/r/${sub}/about/rules.json`)

    const rules = buildRulesFromResponse(rulesRes)
    const publicDescription = about.data?.public_description ?? ''
    const subredditType = about.data?.subreddit_type ?? ''
    const submissionType = about.data?.submission_type ?? ''

    const combinedText = [
      ...rules.map((r) => `${r.title} ${r.description}`),
      publicDescription,
    ]
      .join(' ')
      .toLowerCase()

    const isRestrictedType = subredditType === 'restricted' || subredditType === 'private'
    const isStrongBan = isRestrictedType || STRONG_BAN_PATTERNS.some((p) => p.test(combinedText))
    const isLimited = !isStrongBan && LIMIT_PATTERNS.some((p) => p.test(combinedText))

    let selfPromoPolicy: SubredditGuideline['self_promo_policy']
    let risk: SubredditGuideline['risk']

    if (isStrongBan) {
      selfPromoPolicy = 'banned'
      risk = 'strict'
    } else if (isLimited) {
      selfPromoPolicy = 'limited'
      risk = 'caution'
    } else {
      selfPromoPolicy = 'allowed'
      risk = 'green'
    }

    const linkBanPresent = LINK_BAN_PATTERNS.some((p) => p.test(combinedText))
    const linksAllowed = !(linkBanPresent || submissionType === 'self')

    return {
      subreddit: sub,
      self_promo_policy: selfPromoPolicy,
      links_allowed: linksAllowed,
      min_karma: extractMinKarma(combinedText),
      min_account_age_days: extractMinAccountAgeDays(combinedText),
      cadence_note: findCadenceNote(rules, combinedText),
      risk,
      rules,
      subscribers: about.data?.subscribers ?? null,
      public_description: publicDescription || null,
      fetched_at: new Date().toISOString(),
    }
  }
}

/**
 * Fetches a subreddit's public metadata + rules from Reddit and derives a
 * best-effort self-promotion policy / ban-risk classification. Never throws:
 * any fetch or parse failure results in a safe 'unknown' object.
 */
export async function fetchSubredditGuideline(subreddit: string): Promise<SubredditGuideline> {
  const sub = subreddit.toLowerCase()
  try {
    return await fetchSubredditGuidelineOrThrow(sub)
  } catch (err) {
    console.error(`[guidelines] Failed to fetch guideline for r/${sub}:`, (err as Error).message)
    return safeFallback(sub)
  }
}

const SUBREDDIT_RE = /^[a-zA-Z0-9_]{1,21}$/

/**
 * Confirms a subreddit actually exists and reports what it is, so a name the user
 * typed or the model invented can be rejected before it is saved. An unchecked
 * name is not a harmless mistake: nothing validates existence at scrape time
 * (scraper.ts only pattern-matches the characters), so a bad name silently
 * produces zero posts forever with no error surfaced anywhere.
 *
 * `exists: null` means Reddit could not be reached — we say so rather than
 * reporting a network failure as a missing subreddit.
 */
async function checkSubredditInternal(
  name: string
): Promise<{ check: SubredditCheck; hitNetwork: boolean }> {
  const sub = name.trim().replace(/^\/?r\//i, '').toLowerCase()

  const base: SubredditCheck = {
    name: sub,
    exists: null,
    subscribers: null,
    public_description: null,
    risk: 'unknown',
    self_promo_policy: 'unknown',
    error: null,
  }

  if (!SUBREDDIT_RE.test(sub)) {
    return { check: { ...base, exists: false, error: 'Not a valid subreddit name' }, hitNetwork: false }
  }

  // Serve from the guideline cache when it is fresh: a cached row with a resolved
  // risk is itself proof the subreddit answered at least once, and this keeps
  // repeat checks off Reddit entirely.
  try {
    const rows = (await sql`
      SELECT * FROM subreddit_guidelines WHERE subreddit = ${sub}
    `) as SubredditGuidelineRow[]
    const cached = rows[0]
    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (Number.isFinite(age) && age < CACHE_WINDOW_MS && cached.risk !== 'unknown') {
        return {
          check: {
            ...base,
            exists: true,
            subscribers: cached.subscribers ?? null,
            public_description: cached.public_description ?? null,
            risk: cached.risk,
            self_promo_policy: cached.self_promo_policy,
          },
          hitNetwork: false,
        }
      }
    }
  } catch (readError) {
    console.error(`[guidelines] Cache read failed for r/${sub}:`, (readError as Error).message)
  }

  try {
    // Fetch the full guideline rather than just about.json, and cache it. A bare
    // existence probe would leave nothing behind, so every repeat check of the
    // same name would hit Reddit again on the one shared session cookie — and the
    // UI would never have a ban-risk badge to show for a newly checked subreddit.
    const guideline = await fetchSubredditGuidelineOrThrow(sub)
    await upsertGuideline(guideline)

    return {
      check: {
        ...base,
        exists: true,
        subscribers: guideline.subscribers,
        public_description: guideline.public_description,
        risk: guideline.risk,
        self_promo_policy: guideline.self_promo_policy,
      },
      hitNetwork: true,
    }
  } catch (err) {
    if (err instanceof RedditHttpError && (err.status === 404 || err.status === 403)) {
      // 403 here means private or banned — either way the scraper cannot read it.
      return {
        check: {
          ...base,
          exists: false,
          error: err.status === 404 ? 'No such subreddit' : 'Private or banned',
        },
        hitNetwork: true,
      }
    }
    return { check: { ...base, error: 'Could not reach Reddit' }, hitNetwork: true }
  }
}

export async function checkSubreddit(name: string): Promise<SubredditCheck> {
  const { check } = await checkSubredditInternal(name)
  return check
}

/**
 * Checks several subreddits, spacing out only the ones that actually reach
 * Reddit, for the same reason getGuidelinesForSubreddits does: back-to-back
 * requests are what get the shared session blocked. Whether a name hit the
 * network is reported by the check itself rather than inferred from elapsed
 * time — the cache lookup is a Neon round trip, so timing it would misclassify
 * an ordinary cache hit as a network call and insert a needless 2s delay.
 */
export async function checkSubreddits(names: string[]): Promise<SubredditCheck[]> {
  const results: SubredditCheck[] = []
  let previousHitNetwork = false

  for (const name of names) {
    if (previousHitNetwork) await sleep(INTER_SUBREDDIT_DELAY_MS)
    const { check, hitNetwork } = await checkSubredditInternal(name)
    previousHitNetwork = hitNetwork
    results.push(check)
  }

  return results
}

interface SubredditGuidelineRow {
  subreddit: string
  self_promo_policy: SubredditGuideline['self_promo_policy']
  links_allowed: boolean
  min_karma: number | null
  min_account_age_days: number | null
  cadence_note: string | null
  risk: SubredditGuideline['risk']
  rules: { title: string; description: string }[]
  subscribers: number | null
  public_description: string | null
  fetched_at: string
}

/** Caches a freshly fetched guideline. Never throws: caching is an optimisation. */
async function upsertGuideline(guideline: SubredditGuideline): Promise<void> {
  try {
    await sql`
      INSERT INTO subreddit_guidelines (
        subreddit, self_promo_policy, links_allowed, min_karma,
        min_account_age_days, cadence_note, risk, rules,
        subscribers, public_description, fetched_at
      ) VALUES (
        ${guideline.subreddit}, ${guideline.self_promo_policy}, ${guideline.links_allowed},
        ${guideline.min_karma}, ${guideline.min_account_age_days}, ${guideline.cadence_note},
        ${guideline.risk}, ${JSON.stringify(guideline.rules)}::jsonb,
        ${guideline.subscribers}, ${guideline.public_description}, ${guideline.fetched_at}
      )
      ON CONFLICT (subreddit) DO UPDATE SET
        self_promo_policy = EXCLUDED.self_promo_policy,
        links_allowed = EXCLUDED.links_allowed,
        min_karma = EXCLUDED.min_karma,
        min_account_age_days = EXCLUDED.min_account_age_days,
        cadence_note = EXCLUDED.cadence_note,
        risk = EXCLUDED.risk,
        rules = EXCLUDED.rules,
        subscribers = EXCLUDED.subscribers,
        public_description = EXCLUDED.public_description,
        fetched_at = EXCLUDED.fetched_at
    `
  } catch (upsertError) {
    console.error(
      `[guidelines] Failed to cache r/${guideline.subreddit}:`,
      (upsertError as Error).message
    )
  }
}

function rowToGuideline(row: SubredditGuidelineRow): SubredditGuideline {
  return {
    subreddit: row.subreddit,
    self_promo_policy: row.self_promo_policy,
    links_allowed: row.links_allowed,
    min_karma: row.min_karma,
    min_account_age_days: row.min_account_age_days,
    cadence_note: row.cadence_note,
    risk: row.risk,
    rules: row.rules ?? [],
    subscribers: row.subscribers ?? null,
    public_description: row.public_description ?? null,
    fetched_at: row.fetched_at,
  }
}

/**
 * Returns cached (<= 7 days old) or freshly fetched subreddit guidelines for
 * a list of subreddits, upserting freshly fetched rows into
 * subreddit_guidelines. Applies a 2s delay between subs that require a
 * network fetch (cache hits incur no delay).
 */
export async function getGuidelinesForSubreddits(subreddits: string[]): Promise<SubredditGuideline[]> {
  const results: SubredditGuideline[] = []
  let fetchedAnySub = false

  for (const raw of subreddits) {
    const sub = raw.toLowerCase()

    let cached: SubredditGuidelineRow | null = null
    try {
      const rows = (await sql`
        SELECT * FROM subreddit_guidelines WHERE subreddit = ${sub}
      `) as SubredditGuidelineRow[]
      cached = rows[0] ?? null
    } catch (readError) {
      console.error(`[guidelines] Failed to read cache for r/${sub}:`, (readError as Error).message)
    }

    if (cached) {
      const row = cached
      const age = Date.now() - new Date(row.fetched_at).getTime()
      if (Number.isFinite(age) && age < CACHE_WINDOW_MS) {
        results.push(rowToGuideline(row))
        continue
      }
    }

    if (fetchedAnySub) {
      await sleep(INTER_SUBREDDIT_DELAY_MS)
    }

    const guideline = await fetchSubredditGuideline(sub)
    fetchedAnySub = true

    await upsertGuideline(guideline)

    results.push(guideline)
  }

  return results
}
