import 'server-only'
import { sql } from '@/lib/db'
import type { SubredditGuideline } from '@/lib/types'
import { fetchRedditJson } from '@/lib/reddit-http'

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
    fetched_at: new Date().toISOString(),
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
    const about = await fetchRedditJson<RedditAboutResponse>(`/r/${sub}/about.json`)
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
      fetched_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`[guidelines] Failed to fetch guideline for r/${sub}:`, (err as Error).message)
    return safeFallback(sub)
  }
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
  fetched_at: string
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

    try {
      await sql`
        INSERT INTO subreddit_guidelines (
          subreddit, self_promo_policy, links_allowed, min_karma,
          min_account_age_days, cadence_note, risk, rules, fetched_at
        ) VALUES (
          ${guideline.subreddit}, ${guideline.self_promo_policy}, ${guideline.links_allowed},
          ${guideline.min_karma}, ${guideline.min_account_age_days}, ${guideline.cadence_note},
          ${guideline.risk}, ${JSON.stringify(guideline.rules)}::jsonb, ${guideline.fetched_at}
        )
        ON CONFLICT (subreddit) DO UPDATE SET
          self_promo_policy = EXCLUDED.self_promo_policy,
          links_allowed = EXCLUDED.links_allowed,
          min_karma = EXCLUDED.min_karma,
          min_account_age_days = EXCLUDED.min_account_age_days,
          cadence_note = EXCLUDED.cadence_note,
          risk = EXCLUDED.risk,
          rules = EXCLUDED.rules,
          fetched_at = EXCLUDED.fetched_at
      `
    } catch (upsertError) {
      console.error(`[guidelines] Failed to cache r/${sub}:`, (upsertError as Error).message)
    }

    results.push(guideline)
  }

  return results
}
