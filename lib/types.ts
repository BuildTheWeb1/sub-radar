export type PostStatus = 'new' | 'replied' | 'ignored' | 'saved'

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
  started_at: string
  finished_at: string | null
  posts_found: number
  error_message: string | null
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
