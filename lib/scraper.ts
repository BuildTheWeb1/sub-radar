import { RedditPost } from './types'
import { fetchRedditJson } from './reddit-http'

interface RedditChild {
  data: {
    id: string
    title: string
    permalink: string
    subreddit: string
    author: string
    selftext: string
    score: number
    num_comments: number
    created_utc: number
  }
}

interface RedditResponse {
  data: {
    children: RedditChild[]
  }
}

function scoreRelevance(title: string, body: string, keywords: string[]): number {
  if (keywords.length === 0) return 0

  const text = (title + ' ' + body).toLowerCase()

  // Score: count occurrences of user-configured keywords
  const keywordScore = keywords.reduce((sum, kw) => {
    const matches = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
    return sum + matches * 2
  }, 0)

  return Math.min(keywordScore * 10, 100)
}

async function fetchSubredditPosts(
  subreddit: string,
  keyword: string,
  limit = 25
): Promise<RedditChild[]> {
  const params = new URLSearchParams({
    q: keyword,
    sort: 'new',
    limit: String(limit),
    restrict_sr: 'true',
  })

  const json = await fetchRedditJson<RedditResponse>(`/r/${subreddit}/search.json?${params}`)
  return json.data.children
}

const SUBREDDIT_RE = /^[a-zA-Z0-9_]{1,21}$/

export async function scrape(
  subreddits: string[],
  keywords: string[],
  onProgress?: (msg: string) => void
): Promise<RedditPost[]> {
  const seen = new Set<string>()
  const results: RedditPost[] = []

  // Defense-in-depth: skip any subreddit that doesn't match the expected pattern
  const safeSubreddits = subreddits.filter((s) => SUBREDDIT_RE.test(s))

  const total = safeSubreddits.length * keywords.length
  let count = 0

  for (const subreddit of safeSubreddits) {
    for (const keyword of keywords) {
      count++
      onProgress?.(`[${count}/${total}] r/${subreddit} → "${keyword}"`)

      try {
        const children = await fetchSubredditPosts(subreddit, keyword)

        for (const child of children) {
          const d = child.data
          if (seen.has(d.id)) continue
          seen.add(d.id)

          results.push({
            reddit_id: d.id,
            title: d.title,
            url: `https://reddit.com${d.permalink}`,
            subreddit: d.subreddit,
            author: d.author,
            body: d.selftext.slice(0, 500),
            upvotes: d.score,
            num_comments: d.num_comments,
            relevance_score: scoreRelevance(d.title, d.selftext, keywords),
            posted_at: new Date(d.created_utc * 1000).toISOString(),
          })
        }
      } catch (err) {
        onProgress?.(`  ⚠ Error: ${(err as Error).message}`)
      }
    }
  }

  return results.sort((a, b) => b.relevance_score - a.relevance_score)
}

interface ScrapePair {
  subreddit: string
  keyword: string
}

/**
 * Build the flat, ordered list of subreddit x keyword pairs that scrape()/scrapeChunk()
 * iterate over. Kept in one place so offsets computed against it stay stable across calls.
 */
function buildPairs(subreddits: string[], keywords: string[]): ScrapePair[] {
  const safeSubreddits = subreddits.filter((s) => SUBREDDIT_RE.test(s))
  const pairs: ScrapePair[] = []
  for (const subreddit of safeSubreddits) {
    for (const keyword of keywords) {
      pairs.push({ subreddit, keyword })
    }
  }
  return pairs
}

export interface ScrapeChunkResult {
  posts: RedditPost[]
  nextOffset: number
  cycleComplete: boolean
  /** Size of the campaign's full pair list, so callers can report cycle progress. */
  pairsTotal: number
}

/**
 * Structured, per-pair progress. Distinct from `onProgress`, which is free-form
 * log text: this is the machine-readable form the cron route persists to
 * scrape_jobs so the dashboard can show which search is running right now.
 *
 * Awaited inside the scrape loop, so a slow handler eats into TIME_BUDGET_MS —
 * keep it to a single cheap write. `index` is 1-based and absolute within the
 * cycle (not within this chunk), matching `pairs_done` semantics.
 */
export interface ScrapePairProgress {
  index: number
  total: number
  subreddit: string
  keyword: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Delay between plain fetch() requests to Reddit. Playwright's page navigation used to
// provide natural spacing between requests; a plain fetch() is fast enough that we need
// an explicit delay here to avoid hammering Reddit back-to-back.
const INTER_REQUEST_DELAY_MS = 1500

// Wall-clock budget for a single scrapeChunk() call. Reddit's response time is variable
// (retries on a 403/429 add their own backoff), so this is time-boxed rather than relying
// solely on maxPairs — once the budget is spent, the chunk stops and reports how far it
// got via nextOffset, to be picked up by the next invocation. Kept well under Vercel's
// serverless function time limit (60s on Hobby): the caller still has to sequentially
// insert every post found into Postgres afterward, which itself can take 20-30s for a
// large batch, so this budget leaves that phase plenty of room.
//
// Deliberately kept BELOW fetchRedditJson()'s worst-case single-call cost (~13.5s: two
// 6s request timeouts plus a 1.5s retry backoff — see reddit-http.ts). The budget check
// only runs *between* pairs, so if it were set above that worst case, two stalled calls
// (e.g. right as a cookie expires and every request starts blocking) could stack past the
// intended budget before the loop notices. Below it, at most one stalled call can ever
// slip through before the next check trips.
const TIME_BUDGET_MS = 10_000

/**
 * Process a bounded slice of the subreddit x keyword pair list, starting at `startOffset`
 * and covering at most `maxPairs` pairs (or until TIME_BUDGET_MS is spent, whichever comes
 * first). Designed to be called repeatedly (e.g. once per cron invocation) so a large
 * campaign's full pair list is eventually covered across multiple runs.
 *
 * `maxPairs` defaults to 15: each pair costs a plain fetch() plus a ~1.5s inter-request
 * delay; the time budget is what actually bounds a run when Reddit is slow to respond.
 */
export async function scrapeChunk(
  subreddits: string[],
  keywords: string[],
  startOffset: number,
  maxPairs = 15,
  onProgress?: (msg: string) => void,
  onPair?: (progress: ScrapePairProgress) => Promise<void> | void
): Promise<ScrapeChunkResult> {
  const pairs = buildPairs(subreddits, keywords)
  const total = pairs.length

  if (total === 0) {
    return { posts: [], nextOffset: 0, cycleComplete: true, pairsTotal: 0 }
  }

  // Normalize in case a stale offset is out of range (e.g. campaign edited since last run).
  const safeStart = ((startOffset % total) + total) % total
  const slice = pairs.slice(safeStart, safeStart + maxPairs)

  const seen = new Set<string>()
  const results: RedditPost[] = []
  const startedAt = Date.now()

  let processed = 0
  for (const { subreddit, keyword } of slice) {
    if (processed > 0 && Date.now() - startedAt >= TIME_BUDGET_MS) {
      onProgress?.(`  ⏱ Time budget spent, stopping chunk early at ${processed}/${slice.length}`)
      break
    }

    processed++
    onProgress?.(`[${safeStart + processed}/${total}] r/${subreddit} → "${keyword}"`)

    // Published before the fetch, not after, so the UI names the search that is
    // currently in flight rather than the one that just finished.
    try {
      await onPair?.({ index: safeStart + processed, total, subreddit, keyword })
    } catch (err) {
      // Progress reporting is cosmetic; never let it abort a scrape.
      onProgress?.(`  ⚠ Progress update failed: ${(err as Error).message}`)
    }

    if (processed > 1) {
      await sleep(INTER_REQUEST_DELAY_MS)
    }

    try {
      const children = await fetchSubredditPosts(subreddit, keyword)

      for (const child of children) {
        const d = child.data
        if (seen.has(d.id)) continue
        seen.add(d.id)

        results.push({
          reddit_id: d.id,
          title: d.title,
          url: `https://reddit.com${d.permalink}`,
          subreddit: d.subreddit,
          author: d.author,
          body: d.selftext.slice(0, 500),
          upvotes: d.score,
          num_comments: d.num_comments,
          relevance_score: scoreRelevance(d.title, d.selftext, keywords),
          posted_at: new Date(d.created_utc * 1000).toISOString(),
        })
      }
    } catch (err) {
      onProgress?.(`  ⚠ Error: ${(err as Error).message}`)
    }
  }

  const endOffset = safeStart + processed
  const cycleComplete = endOffset >= total
  const nextOffset = cycleComplete ? 0 : endOffset

  return {
    posts: results.sort((a, b) => b.relevance_score - a.relevance_score),
    nextOffset,
    cycleComplete,
    pairsTotal: total,
  }
}
