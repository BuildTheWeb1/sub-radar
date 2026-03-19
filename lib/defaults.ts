import type { Config } from './types'

export const DEFAULT_CONFIG: Omit<Config, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  subreddits: ['intermittentfasting', 'fasting', 'OMAD', 'moodtracking', 'mentalhealth', 'selfimprovement', 'loseit', 'keto'],
  keywords: ['mood', 'mental clarity', 'brain fog', 'feel better', 'emotional', 'anxiety fasting', 'how do you feel', 'track mood', 'fasting benefits', 'mood swings', 'emotional eating', 'mindfulness fasting'],
  product_description: '',
  scrape_frequency: '2h',
  min_relevance: 20,
}
