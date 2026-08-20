import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateReplyIdeas, ContentIdeasPost } from '@/lib/content-ideas'
import { getGuidelinesForSubreddits } from '@/lib/guidelines'
import { deductCredits, refundCredits } from '@/lib/credits'
import { POST_CONTENT_IDEA_COST } from '@/lib/credit-costs'
import type { ReplyIdea } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  let post: (ContentIdeasPost & { reply_ideas: ReplyIdea[] | null }) | undefined
  try {
    const rows = (await sql`
      SELECT title, body, subreddit, reply_ideas FROM posts WHERE id = ${id} AND user_id = ${userId}
    `) as (ContentIdeasPost & { reply_ideas: ReplyIdea[] | null })[]
    post = rows[0]
  } catch (err) {
    console.error('[posts reply-idea] Failed to load post:', err)
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Already generated this scan cycle (reply_ideas persists until
  // clearReplyIdeasStep resets it on the next scan) — return the cached
  // result instead of charging again. The client already disables the button
  // once it has a result, but this makes the rule hold server-side too, not
  // just as UI polish.
  if (post.reply_ideas && post.reply_ideas.length > 0) {
    return NextResponse.json({ replies: post.reply_ideas })
  }

  const campaign = await getOrCreateCampaign(userId)

  // Best-effort: a guideline lookup failure must not block reply generation —
  // it just falls back to the 'unknown' (strictest) self-promotion instruction
  // inside generateReplyIdeas, same as a post-card.tsx render with no cached
  // guideline for that subreddit.
  let guideline = null
  try {
    const guidelines = await getGuidelinesForSubreddits([post.subreddit])
    guideline = guidelines[0] ?? null
  } catch (err) {
    console.error('[posts reply-idea] Failed to load subreddit guideline:', err)
  }

  const spend = await deductCredits(userId, POST_CONTENT_IDEA_COST, 'post_reply_idea', id)
  if (!spend.ok) {
    return NextResponse.json(
      {
        error: `Not enough credits (need ${POST_CONTENT_IDEA_COST}, have ${spend.balance}).`,
        need: POST_CONTENT_IDEA_COST,
        have: spend.balance,
      },
      { status: 402 }
    )
  }

  try {
    const replies = await generateReplyIdeas(post, guideline, campaign.product_description)
    if (replies.length === 0) {
      // Nothing usable came back — refund rather than charge, since this
      // deducts up front before knowing the model will find an angle. Leave
      // reply_ideas NULL so the button stays enabled for a retry.
      await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:empty`)
      return NextResponse.json({ replies })
    }

    // `AND reply_ideas IS NULL` closes the race where two concurrent requests
    // for the same post (two tabs, a double-fire) both pass the cached-result
    // check above, both charge, and both generate — without this guard the
    // second UPDATE would silently overwrite the first, so one paid-for
    // result is unreachable after refresh with no refund for it. Whichever
    // request's UPDATE actually lands keeps its charge; the loser refunds
    // itself and returns the winner's persisted result instead of its own.
    let persisted: ReplyIdea[] = replies
    try {
      const rows = (await sql`
        UPDATE posts SET reply_ideas = ${JSON.stringify(replies)}::jsonb
        WHERE id = ${id} AND user_id = ${userId} AND reply_ideas IS NULL
        RETURNING reply_ideas
      `) as { reply_ideas: ReplyIdea[] }[]
      if (rows.length === 0) {
        await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:dup`)
        const existing = (await sql`
          SELECT reply_ideas FROM posts WHERE id = ${id} AND user_id = ${userId}
        `) as { reply_ideas: ReplyIdea[] | null }[]
        persisted = existing[0]?.reply_ideas ?? replies
      }
    } catch (err) {
      console.error('[posts reply-idea] Failed to persist reply ideas:', err)
    }
    return NextResponse.json({ replies: persisted })
  } catch (err) {
    console.error('[posts reply-idea] Failed to generate reply ideas:', err)
    await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:error`)
    return NextResponse.json({ error: 'idea_failed' }, { status: 500 })
  }
}
