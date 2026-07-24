import { sql } from '@/lib/db'
import { DEFAULT_CONFIG } from '@/lib/defaults'
import type { Campaign } from '@/lib/types'

/**
 * Returns the user's first campaign (by created_at), or creates a default
 * one if they don't have any yet. There is currently one campaign per user
 * in the UI — multi-campaign support is a future concern.
 */
export async function getOrCreateCampaign(userId: string): Promise<Campaign> {
  let existing: Campaign | null = null
  try {
    const rows = (await sql`
      SELECT * FROM campaigns
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT 1
    `) as Campaign[]
    existing = rows[0] ?? null
  } catch (err) {
    throw new Error(`[campaigns] Failed to load campaign: ${(err as Error).message}`)
  }

  if (existing) {
    return existing
  }

  try {
    const rows = (await sql`
      INSERT INTO campaigns (
        user_id, name, product_description, subreddits, keywords, scrape_frequency, min_relevance
      ) VALUES (
        ${userId}, 'Default', '', ${[]}::text[], ${[]}::text[],
        ${DEFAULT_CONFIG.scrape_frequency}, ${DEFAULT_CONFIG.min_relevance}
      )
      RETURNING *
    `) as Campaign[]
    const created = rows[0] ?? null

    if (!created) {
      throw new Error('no row returned')
    }

    return created
  } catch (err) {
    throw new Error(`[campaigns] Failed to create default campaign: ${(err as Error).message}`)
  }
}
