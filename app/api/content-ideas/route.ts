import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateContentIdeas } from '@/lib/content-ideas'
import { deductCredits } from '@/lib/credits'

const CONTENT_IDEAS_COST = 3

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const campaign = await getOrCreateCampaign(userId)

  let posts: { title: string; body: string | null; subreddit: string }[]
  try {
    posts = (await sql`
      SELECT title, body, subreddit FROM posts
      WHERE user_id = ${userId} AND campaign_id = ${campaign.id}
      ORDER BY upvotes DESC, scraped_at DESC
      LIMIT 20
    `) as { title: string; body: string | null; subreddit: string }[]
  } catch (err) {
    console.error('[content-ideas GET] Failed to query posts:', err)
    return NextResponse.json({ error: 'ideas_failed' }, { status: 500 })
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ painPoints: [], postIdeas: [] })
  }

  const spend = await deductCredits(userId, CONTENT_IDEAS_COST, 'content_ideas', campaign.id)
  if (!spend.ok) {
    return NextResponse.json(
      { error: `Not enough credits (need ${CONTENT_IDEAS_COST}, have ${spend.balance}).` },
      { status: 402 }
    )
  }

  try {
    const ideas = await generateContentIdeas(posts, campaign.product_description)
    return NextResponse.json(ideas)
  } catch (err) {
    console.error('[content-ideas GET] Failed to generate ideas:', err)
    return NextResponse.json({ error: 'ideas_failed' }, { status: 500 })
  }
}
