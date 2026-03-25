import { RedditPost } from './types'

const USER_AGENT = 'SubRadar/1.0 (reddit monitoring tool)'
const DELAY_MS = 2000 // 2s between requests to stay under Reddit rate limits

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scoreRelevance(title: string, body: string, keywords: string[]): number {
  const text = (title + ' ' + body).toLowerCase()
  const highValueTerms = ['mood', 'feel', 'mental', 'emotion', 'clarity', 'track', 'how are you']

  // Base score: count occurrences of high-value terms
  const baseScore = highValueTerms.reduce((sum, term) => {
    const matches = (text.match(new RegExp(term, 'gi')) || []).length
    return sum + matches
  }, 0)

  // Bonus: count occurrences of user-configured keywords
  const keywordScore = keywords.reduce((sum, kw) => {
    const matches = (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
    return sum + matches * 2 // keywords worth more than base terms
  }, 0)

  return Math.min((baseScore + keywordScore) * 10, 100)
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

  const url = `https://www.reddit.com/r/${subreddit}/search.json?${params}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error(`Rate limited on r/${subreddit}`)
    throw new Error(`HTTP ${res.status} fetching r/${subreddit}`)
  }

  const json = (await res.json()) as RedditResponse
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

      if (count < total) await sleep(DELAY_MS)
    }
  }

  return results.sort((a, b) => b.relevance_score - a.relevance_score)
}
