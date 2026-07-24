import { RedditPost } from './types'
import { fetchRedditJson } from './reddit-browser'

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
}

/**
 * Process a bounded slice of the subreddit x keyword pair list, starting at `startOffset`
 * and covering at most `maxPairs` pairs. Designed to be called repeatedly (e.g. once per
 * cron invocation) so a large campaign's full pair list is eventually covered across
 * multiple runs without exceeding a serverless function's time limit.
 *
 * `maxPairs` defaults to 8: each pair now costs a real headless-browser page
 * navigation (~2-4s) rather than a plain fetch(), and there's no artificial
 * inter-request delay (navigation itself provides natural spacing), so 8
 * pairs keeps a single invocation comfortably under ~50s.
 */
export async function scrapeChunk(
  subreddits: string[],
  keywords: string[],
  startOffset: number,
  maxPairs = 8,
  onProgress?: (msg: string) => void
): Promise<ScrapeChunkResult> {
  const pairs = buildPairs(subreddits, keywords)
  const total = pairs.length

  if (total === 0) {
    return { posts: [], nextOffset: 0, cycleComplete: true }
  }

  // Normalize in case a stale offset is out of range (e.g. campaign edited since last run).
  const safeStart = ((startOffset % total) + total) % total
  const slice = pairs.slice(safeStart, safeStart + maxPairs)

  const seen = new Set<string>()
  const results: RedditPost[] = []

  let count = 0
  for (const { subreddit, keyword } of slice) {
    count++
    onProgress?.(`[${safeStart + count}/${total}] r/${subreddit} → "${keyword}"`)

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

  const endOffset = safeStart + slice.length
  const cycleComplete = endOffset >= total
  const nextOffset = cycleComplete ? 0 : endOffset

  return {
    posts: results.sort((a, b) => b.relevance_score - a.relevance_score),
    nextOffset,
    cycleComplete,
  }
}
