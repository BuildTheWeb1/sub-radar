export type PostStatus = 'new' | 'replied' | 'ignored' | 'saved'

/** One drafted Reddit reply for a post — see generateReplyIdeas in lib/content-ideas.ts. */
export interface ReplyIdea {
  comment: string
  angle: string
}

export interface Post {
  id: string
  user_id: string
  reddit_id: string
  title: string
  url: string
  subreddit: string
  author: string | null
  body: string | null
  upvotes: number
  num_comments: number
  relevance_score: number
  status: PostStatus
  posted_at: string
  scraped_at: string
  campaign_id: string | null
  /** Cached result of the per-post "Reply idea" button — null until generated,
   * cleared back to null at the start of every new scan cycle (see
   * clearReplyIdeasStep in lib/workflows/scrape-cycle.ts) so a stale draft
   * doesn't linger under a post from an earlier batch of leads. */
  reply_ideas: ReplyIdea[] | null
}

export interface Campaign {
  id: string
  user_id: string
  name: string
  product_description: string | null
  subreddits: string[]
  keywords: string[]
  scrape_frequency: '1h' | '2h' | '6h' | '12h'
  min_relevance: number
  scrape_offset: number
  last_scraped_at: string | null
  created_at: string
  updated_at: string
  /** Why the workflow-based scan cycle didn't (re)start, e.g. 'insufficient_credits'. Null when active. */
  paused_reason: string | null
  /** The in-flight scrapeCycleWorkflow run's id, or null when no cycle is running. */
  active_run_id: string | null
  /** When the next scan cycle is scheduled to start. */
  next_run_at: string | null
}

export interface Config {
  id: string
  user_id: string
  subreddits: string[]
  keywords: string[]
  product_description: string | null
  scrape_frequency: '1h' | '2h' | '6h' | '12h'
  min_relevance: number
  created_at: string
  updated_at: string
}

export interface ScrapeJob {
  id: string
  user_id: string
  campaign_id: string | null
  started_at: string
  finished_at: string | null
  posts_found: number
  error_message: string | null
  /** Total subreddit x keyword pairs in the campaign's full cycle. */
  pairs_total: number
  /** Pairs completed so far in the current cycle, across all invocations. */
  pairs_done: number
  current_subreddit: string | null
  current_keyword: string | null
}

/** Shape returned by /api/scrape-status and consumed by the ScraperBar. */
export interface ScrapeStatus {
  running: boolean
  /** True when a job never closed out — the invocation died mid-scrape. */
  stalled: boolean
  last_scraped_at: string | null
  next_scrape_at: string | null
  cadence: string
  pairs_done: number
  pairs_total: number
  current_subreddit: string | null
  current_keyword: string | null
  /** Posts stored by the most recently finished job. */
  last_posts_found: number
  last_finished_at: string | null
  last_error: string | null
  new_count: number
  week_count: number
  frequency: string
  /** Why the scan cycle didn't (re)start, e.g. 'insufficient_credits'. Null when not paused. */
  paused_reason: string | null
}

export interface Reply {
  id: string
  user_id: string
  post_id: string
  reply_text: string | null
  replied_at: string
}

export interface RedditPost {
  reddit_id: string
  title: string
  url: string
  subreddit: string
  author: string
  body: string
  upvotes: number
  num_comments: number
  relevance_score: number
  posted_at: string
}

export interface SubredditGuideline {
  subreddit: string
  self_promo_policy: 'allowed' | 'limited' | 'banned' | 'unknown'
  links_allowed: boolean
  min_karma: number | null
  min_account_age_days: number | null
  cadence_note: string | null
  risk: 'green' | 'caution' | 'strict' | 'unknown'
  rules: { title: string; description: string }[]
  subscribers: number | null
  public_description: string | null
  fetched_at: string
}

/** Result of checking a subreddit name a user typed or an LLM suggested. */
export interface SubredditCheck {
  name: string
  /** null when Reddit could not be reached — absence of proof, not proof of absence. */
  exists: boolean | null
  subscribers: number | null
  public_description: string | null
  risk: SubredditGuideline['risk']
  self_promo_policy: SubredditGuideline['self_promo_policy']
  error: string | null
}
