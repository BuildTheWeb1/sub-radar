import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { suggestSubredditsAndKeywords } from '@/lib/onboarding'
import { deductCredits } from '@/lib/credits'

const SUGGEST_COST = 1

/**
 * Suggests subreddits and keywords for a product description. Lives at the top
 * level rather than under /onboarding because it is no longer onboarding-only —
 * Radar re-runs it whenever the user wants more targets.
 *
 * Returns suggestions unverified and fast; the client follows up with
 * /api/subreddits/check to confirm the suggested subreddits actually exist.
 * Verifying here would add ~2s per uncached subreddit to a request the user is
 * staring at a spinner for.
 */
export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const body = await req.json().catch(() => ({}))
  const { productDescription } = body

  if (typeof productDescription !== 'string' || productDescription.trim().length < 20) {
    return NextResponse.json(
      { error: 'Describe your product in at least 20 characters first' },
      { status: 400 }
    )
  }
  // Same ceiling /api/config enforces on the stored field. Without it, any signed-in
  // user could post a multi-megabyte string straight into a billed model call.
  if (productDescription.length > 2000) {
    return NextResponse.json(
      { error: 'Product description must be under 2000 characters' },
      { status: 400 }
    )
  }

  const spend = await deductCredits(userId, SUGGEST_COST, 'suggest', undefined)
  if (!spend.ok) {
    return NextResponse.json(
      { error: `Not enough credits (need ${SUGGEST_COST}, have ${spend.balance}).` },
      { status: 402 }
    )
  }

  try {
    const suggestions = await suggestSubredditsAndKeywords(productDescription)
    return NextResponse.json(suggestions)
  } catch (err) {
    console.error('[suggest POST] Failed to generate suggestions:', err)
    return NextResponse.json({ error: 'suggestion_failed' }, { status: 500 })
  }
}
