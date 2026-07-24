import type { Config } from './types'

export const DEFAULT_CONFIG: Omit<Config, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  subreddits: [],
  keywords: [],
  product_description: '',
  scrape_frequency: '2h',
  // Kept at 0 while relevance scoring is keyword-only (posts score 0 unless a
  // keyword appears verbatim, so a higher threshold would empty the feed).
  // Raise this once semantic relevance scoring (Pillar 1) lands.
  min_relevance: 0,
}
