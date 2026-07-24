import 'server-only'
import type { Browser, BrowserContext } from 'playwright'

// Realistic recent desktop Chrome UA. Reddit's bot-block keys heavily off
// TLS/JS fingerprint + UA; a real Chromium instance loading these URLs
// passes where a plain server-side fetch() gets an HTTP 403 block page.
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const NAV_TIMEOUT_MS = 15_000
const WARMUP_TIMEOUT_MS = 20_000

let browserPromise: Promise<Browser> | null = null
let contextPromise: Promise<BrowserContext> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import('playwright').then(async ({ chromium }) => {
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      })
      // If the browser crashes or disconnects, drop the cached singletons so
      // the next call relaunches a fresh one instead of reusing a dead handle.
      browser.on('disconnected', () => {
        browserPromise = null
        contextPromise = null
      })
      return browser
    })
  }
  return browserPromise
}

async function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = getBrowser().then(async (browser) => {
      const context = await browser.newContext({
        userAgent: DEFAULT_USER_AGENT,
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      })

      // Mask the most obvious headless-automation tells before page scripts run.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false })
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      })

      // Warm up the session. A cookieless context hitting a `.json` URL directly
      // gets a 403 block page; loading the HTML site first lets Reddit set its
      // session/anti-bot cookies, which the shared context then reuses so the
      // subsequent `.json` requests pass.
      await warmUp(context)
      return context
    })
  }
  return contextPromise
}

/** Loads the Reddit homepage once to establish session/anti-bot cookies. */
async function warmUp(context: BrowserContext): Promise<void> {
  const page = await context.newPage()
  try {
    await page.goto('https://www.reddit.com/', {
      waitUntil: 'domcontentloaded',
      timeout: WARMUP_TIMEOUT_MS,
    })
    // Give Reddit a moment to run any JS challenge and set cookies.
    await page.waitForTimeout(2500)
  } catch {
    // Non-fatal — a real error will surface on the actual request if needed.
  } finally {
    await page.close()
  }
}

/**
 * Fetches a Reddit JSON endpoint using a real (headless) Chromium browser
 * instead of a server-side fetch(), so it passes Reddit's bot-detection
 * (which 403s plain fetch() requests regardless of User-Agent). `path` must
 * begin with `/`, e.g. `/r/foo/about.json` or `/r/foo/search.json?q=bar`.
 */
export async function fetchRedditJson<T = unknown>(path: string): Promise<T> {
  try {
    return await requestJson<T>(path)
  } catch (err) {
    // If we were blocked, the session cookies may have expired or never took.
    // Re-warm the shared context once and retry before giving up.
    if (err instanceof Error && /blocked/i.test(err.message)) {
      const context = await getContext()
      await warmUp(context)
      return await requestJson<T>(path)
    }
    throw err
  }
}

async function requestJson<T = unknown>(path: string): Promise<T> {
  const hasQuery = path.includes('?')
  const url = `https://www.reddit.com${path}${hasQuery ? '&raw_json=1' : '?raw_json=1'}`

  const context = await getContext()
  const page = await context.newPage()

  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
    const status = res?.status() ?? 0
    const body = res ? await res.text() : ''

    if (status === 403 || status === 429) {
      throw new Error(`Reddit blocked (${status})`)
    }

    if (!res || !res.ok()) {
      throw new Error(`Reddit request failed (${status}) for ${path}`)
    }

    try {
      return JSON.parse(body) as T
    } catch {
      throw new Error(`Reddit blocked (${status}): non-JSON response for ${path}`)
    }
  } finally {
    await page.close()
  }
}

/** Closes the shared browser (and its context), if one was ever launched. */
export async function closeRedditBrowser(): Promise<void> {
  const ctxPromise = contextPromise
  const brwPromise = browserPromise
  contextPromise = null
  browserPromise = null

  if (ctxPromise) {
    try {
      const ctx = await ctxPromise
      await ctx.close()
    } catch {
      // ignore
    }
  }

  if (brwPromise) {
    try {
      const browser = await brwPromise
      await browser.close()
    } catch {
      // ignore
    }
  }
}
