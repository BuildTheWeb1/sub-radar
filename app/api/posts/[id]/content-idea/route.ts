import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateContentIdeaForPost, ContentIdeasPost } from '@/lib/content-ideas'
import { deductCredits, refundCredits } from '@/lib/credits'
import { POST_CONTENT_IDEA_COST } from '@/lib/credit-costs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  let post: ContentIdeasPost | undefined
  try {
    const rows = (await sql`
      SELECT title, body, subreddit FROM posts WHERE id = ${id} AND user_id = ${userId}
    `) as ContentIdeasPost[]
    post = rows[0]
  } catch (err) {
    console.error('[posts content-idea] Failed to load post:', err)
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const campaign = await getOrCreateCampaign(userId)

  const spend = await deductCredits(userId, POST_CONTENT_IDEA_COST, 'post_content_idea', id)
  if (!spend.ok) {
    return NextResponse.json(
      { error: `Not enough credits (need ${POST_CONTENT_IDEA_COST}, have ${spend.balance}).` },
      { status: 402 }
    )
  }

  try {
    const postIdeas = await generateContentIdeaForPost(post, campaign.product_description)
    // Nothing usable came back — refund rather than charge for an empty result,
    // since unlike the bulk Content Ideas run (which only spends when it has
    // >=1 source post to mine) this deducts up front before knowing the model
    // will find an angle.
    if (postIdeas.length === 0) {
      await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:empty`)
    }
    return NextResponse.json({ postIdeas })
  } catch (err) {
    console.error('[posts content-idea] Failed to generate idea:', err)
    await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:error`)
    return NextResponse.json({ error: 'idea_failed' }, { status: 500 })
  }
}
