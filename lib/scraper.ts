import { RedditPost, Campaign } from './types'
import { fetchRedditJson } from './reddit-http'
import { sql } from './db'

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

// Reddit threads older than this are treated as dead — the OP has moved on and a
// reply reads as necroposting. Enforced here, at scrape time, rather than as a
// display filter, so stale posts never burn scrape credits or storage.
const MAX_POST_AGE_DAYS = 21

export function scoreRelevance(title: string, body: string, keywords: string[]): number {
  if (keywords.length === 0) return 0

  const text = (title + ' ' + body).toLowerCase()

  // Score: count occurrences of user-configured keywords
  const keywordScore = keywords.reduce((sum, kw) => {
    const matches = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
    return sum + matches * 2
  }, 0)

  return Math.min(keywordScore * 10, 100)
}

export async function fetchSubredditPosts(
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

export interface ScrapePair {
  subreddit: string
  keyword: string
}

/**
 * Build the flat, ordered list of subreddit x keyword pairs a scan cycle iterates
 * over. Kept in one place so callers (the workflow, progress reporting) agree on
 * ordering and on which subreddit names are safe to query.
 */
export function buildPairs(subreddits: string[], keywords: string[]): ScrapePair[] {
  const safeSubreddits = subreddits.filter((s) => SUBREDDIT_RE.test(s))
  const pairs: ScrapePair[] = []
  for (const subreddit of safeSubreddits) {
    for (const keyword of keywords) {
      pairs.push({ subreddit, keyword })
    }
  }
  return pairs
}

export interface ScrapePairResult {
  inserted: number
  found: number
}

/**
 * Process a single subreddit x keyword pair: fetch, score, insert new posts, and
 * (when jobId is given) write live progress to scrape_jobs so the dashboard can
 * show which search is running right now. Called once per pair by
 * scrapePairStep in lib/workflows/scrape-cycle.ts — no offset/budget logic here,
 * since the workflow's own step boundaries (automatic retry per step, resumable
 * runs) provide durability that used to be hand-rolled via a cursor and a
 * wall-clock time budget.
 */
export async function scrapeOnePair(
  campaign: Campaign,
  subreddit: string,
  keyword: string,
  jobId: string | null,
  pairIndex: number,
  pairsTotal: number
): Promise<ScrapePairResult> {
  if (jobId) {
    try {
      await sql`
        UPDATE scrape_jobs
        SET pairs_total = ${pairsTotal}, current_subreddit = ${subreddit}, current_keyword = ${keyword}
        WHERE id = ${jobId}
      `
    } catch (err) {
      console.error(`[scrape] Failed to update progress for job ${jobId}:`, err)
    }
  }

  let inserted = 0
  let found = 0

  try {
    const children = await fetchSubredditPosts(subreddit, keyword)
    const seen = new Set<string>()

    for (const child of children) {
      const d = child.data
      if (seen.has(d.id)) continue
      seen.add(d.id)
      found++

      const ageMs = Date.now() - d.created_utc * 1000
      if (ageMs > MAX_POST_AGE_DAYS * 24 * 60 * 60 * 1000) continue

      const relevance_score = scoreRelevance(d.title, d.selftext, campaign.keywords)
      if (relevance_score < campaign.min_relevance) continue

      const post: RedditPost = {
        reddit_id: d.id,
        title: d.title,
        url: `https://reddit.com${d.permalink}`,
        subreddit: d.subreddit,
        author: d.author,
        body: d.selftext.slice(0, 500),
        upvotes: d.score,
        num_comments: d.num_comments,
        relevance_score,
        posted_at: new Date(d.created_utc * 1000).toISOString(),
      }

      try {
        const rows = (await sql`
          INSERT INTO posts (
            user_id, campaign_id, reddit_id, title, url, subreddit, author, body,
            upvotes, num_comments, relevance_score, posted_at
          ) VALUES (
            ${campaign.user_id}, ${campaign.id}, ${post.reddit_id}, ${post.title}, ${post.url},
            ${post.subreddit}, ${post.author}, ${post.body}, ${post.upvotes},
            ${post.num_comments}, ${post.relevance_score}, ${post.posted_at}
          )
          ON CONFLICT (user_id, reddit_id) DO NOTHING
          RETURNING reddit_id
        `) as { reddit_id: string }[]
        if (rows.length > 0) inserted++
      } catch (err) {
        console.error(`[scrape] Failed to upsert post ${post.reddit_id} for campaign ${campaign.id}:`, err)
      }
    }
  } catch (err) {
    console.error(`[scrape] Error fetching r/${subreddit} for "${keyword}":`, (err as Error).message)
  }

  if (jobId) {
    try {
      await sql`
        UPDATE scrape_jobs
        SET pairs_done = ${pairIndex}
        WHERE id = ${jobId}
      `
    } catch (err) {
      console.error(`[scrape] Failed to bump pairs_done for job ${jobId}:`, err)
    }
  }

  return { inserted, found }
}
