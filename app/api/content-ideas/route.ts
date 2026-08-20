import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateContentIdeas, getContentIdeasSourcePosts } from '@/lib/content-ideas'
import { deductCredits } from '@/lib/credits'
import { checkRateLimit } from '@/lib/rate-limit'
import { CONTENT_IDEAS_COST } from '@/lib/credit-costs'

// POST, not GET: this deducts credits and makes a billed model call, and
// NextAuth's session cookie is SameSite=Lax — sent on cross-site top-level
// navigations, not just same-site requests. A GET route with a side effect
// this expensive was a CSRF drain (a malicious page could just navigate a
// signed-in victim's browser here); Lax blocks cross-site POST.
export async function POST() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const rateLimit = await checkRateLimit(`content-ideas:${userId}`, 10, 60)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many requests — try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const campaign = await getOrCreateCampaign(userId)

  let posts: Awaited<ReturnType<typeof getContentIdeasSourcePosts>>
  try {
    posts = await getContentIdeasSourcePosts(userId, campaign)
  } catch (err) {
    console.error('[content-ideas POST] Failed to query posts:', err)
    return NextResponse.json({ error: 'ideas_failed' }, { status: 500 })
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ painPoints: [], postIdeas: [] })
  }

  const spend = await deductCredits(userId, CONTENT_IDEAS_COST, 'content_ideas', campaign.id)
  if (!spend.ok) {
    return NextResponse.json(
      {
        error: `Not enough credits (need ${CONTENT_IDEAS_COST}, have ${spend.balance}).`,
        need: CONTENT_IDEAS_COST,
        have: spend.balance,
      },
      { status: 402 }
    )
  }

  try {
    const ideas = await generateContentIdeas(posts, campaign.product_description)
    return NextResponse.json(ideas)
  } catch (err) {
    console.error('[content-ideas POST] Failed to generate ideas:', err)
    return NextResponse.json({ error: 'ideas_failed' }, { status: 500 })
  }
}
