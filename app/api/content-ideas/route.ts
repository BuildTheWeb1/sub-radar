import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateContentIdeas, getContentIdeasSourcePosts } from '@/lib/content-ideas'
import { deductCredits } from '@/lib/credits'
import { CONTENT_IDEAS_COST } from '@/lib/credit-costs'

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const campaign = await getOrCreateCampaign(userId)

  let posts: Awaited<ReturnType<typeof getContentIdeasSourcePosts>>
  try {
    posts = await getContentIdeasSourcePosts(userId, campaign)
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
