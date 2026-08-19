import 'server-only'

// Plain fetch() replacement for the old Playwright-based fetcher. Playwright
// can't run on Vercel serverless (no persistent process, Chromium exceeds the
// function size limit); a diagnostic confirmed that a real browser-exported
// session Cookie + a full Chrome-like header set passes Reddit's bot block
// from Vercel's datacenter IPs, while headers alone do not.
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: 'https://www.reddit.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
}

// Kept short: a real response (blocked or not) comes back in well under a second: a long
// hang means the request is stuck. Worst case for one fetchRedditJson() call (timeout,
// backoff, retry, timeout again) is ~2*REQUEST_TIMEOUT_MS + RETRY_BACKOFF_MS — each call
// happens inside its own workflow step (see scrapePairStep in
// lib/workflows/scrape-cycle.ts), so a stalled call delays that one pair rather than
// eating a shared time budget for the whole cycle.
const REQUEST_TIMEOUT_MS = 6_000
const RETRY_BACKOFF_MS = 1500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Carries Reddit's HTTP status alongside the message. Callers that need to tell
 * "this subreddit does not exist" (404) apart from "Reddit is refusing us right
 * now" (403/429/timeout) cannot do that by string-matching the message.
 */
export class RedditHttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RedditHttpError'
    this.status = status
  }
}

async function requestJson<T>(url: string): Promise<T> {
  const headers = { ...REQUEST_HEADERS }
  if (process.env.REDDIT_COOKIE) {
    headers.Cookie = process.env.REDDIT_COOKIE
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

  if (res.status === 403 || res.status === 429) {
    throw new RedditHttpError(`Reddit blocked (${res.status})`, res.status)
  }

  if (!res.ok) {
    throw new RedditHttpError(`Reddit request failed (${res.status}) for ${url}`, res.status)
  }

  const body = await res.text()
  try {
    return JSON.parse(body) as T
  } catch {
    throw new RedditHttpError(`Reddit blocked (${res.status}): non-JSON response for ${url}`, res.status)
  }
}

/**
 * Fetches a Reddit JSON endpoint via plain fetch(), carrying a session Cookie
 * (REDDIT_COOKIE) and a browser-like header set. `path` must begin with `/`,
 * e.g. `/r/foo/about.json` or `/r/foo/search.json?q=bar`. Retries once on a
 * 403/429 block after a short backoff before giving up.
 */
export async function fetchRedditJson<T = unknown>(path: string): Promise<T> {
  const hasQuery = path.includes('?')
  const url = `https://www.reddit.com${path}${hasQuery ? '&raw_json=1' : '?raw_json=1'}`

  try {
    return await requestJson<T>(url)
  } catch (err) {
    if (err instanceof Error && /blocked/i.test(err.message)) {
      await sleep(RETRY_BACKOFF_MS)
      return await requestJson<T>(url)
    }
    throw err
  }
}
