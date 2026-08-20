import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { generateReplyIdeas, ContentIdeasPost } from '@/lib/content-ideas'
import { getGuidelinesForSubreddits } from '@/lib/guidelines'
import { deductCredits, refundCredits } from '@/lib/credits'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST_CONTENT_IDEA_COST } from '@/lib/credit-costs'
import type { ReplyIdea } from '@/lib/types'

// Model calls plus a guideline lookup can run past the platform's shorter
// default timeouts; matches the ceiling subreddits/check already sets for
// its own external-call-bound route.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Reused as the sentinel for "claimed, generation in flight" below.
// `reply_ideas` is otherwise either NULL (never generated this cycle) or a
// non-empty array (a real result) — the zero-results case resets it back to
// NULL rather than ever persisting `[]` as a terminal value (see the empty
// branch below), so `[]` on its own unambiguously means "claimed".
const IN_PROGRESS = JSON.stringify([])

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const rateLimit = await checkRateLimit(`reply-idea:${userId}`, 20, 60)
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many requests — try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  // Atomically claim the post before charging or generating anything: only a
  // request that flips reply_ideas from NULL to the IN_PROGRESS sentinel
  // proceeds past this point. Without this, N concurrent requests for the
  // same post all pass a read-only "already generated?" check, all charge,
  // and all trigger a billed LLM call before a single final UPDATE picks one
  // winner — cheap to charge once, expensive to generate N times. See the
  // security review that added this: a user could fire hundreds of
  // concurrent requests against one post they own for ~1 credit total.
  let claim: (ContentIdeasPost & { reply_ideas: ReplyIdea[] | null })[]
  try {
    claim = (await sql`
      UPDATE posts SET reply_ideas = ${IN_PROGRESS}::jsonb
      WHERE id = ${id} AND user_id = ${userId} AND reply_ideas IS NULL
      RETURNING title, body, subreddit, reply_ideas
    `) as (ContentIdeasPost & { reply_ideas: ReplyIdea[] | null })[]
  } catch (err) {
    console.error('[posts reply-idea] Failed to claim post:', err)
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (claim.length === 0) {
    // Either this post doesn't exist/belong to this user, it's already been
    // generated, or another request claimed it moments ago and is still
    // mid-generation. Distinguish those without charging or generating again.
    const rows = (await sql`
      SELECT reply_ideas FROM posts WHERE id = ${id} AND user_id = ${userId}
    `) as { reply_ideas: ReplyIdea[] | null }[]
    const existing = rows[0]
    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    if (existing.reply_ideas && existing.reply_ideas.length > 0) {
      return NextResponse.json({ replies: existing.reply_ideas })
    }
    return NextResponse.json(
      { error: 'A reply idea is already being generated for this post — try again in a moment.' },
      { status: 409 }
    )
  }
  const post = claim[0]

  // Every write below is guarded with `AND reply_ideas = ${IN_PROGRESS}::jsonb`
  // — a compare-and-swap against the exact sentinel *this* request wrote when
  // it claimed the post. Without it, a request that stalls (a slow model
  // call, a platform-timeout retry) past the point where a new scan cycle
  // resets reply_ideas to NULL — see clearReplyIdeasStep — and a second,
  // faster request claims and completes the post fresh, would silently
  // overwrite that newer, separately-paid-for result with its own stale one
  // once it finally finishes. Guarded, that late write just becomes a no-op:
  // the row has moved on, so it's no longer this request's to touch.
  let credited = false
  try {
    const campaign = await getOrCreateCampaign(userId)

    // Best-effort: a guideline lookup failure must not block reply generation
    // — it just falls back to the 'unknown' (strictest) self-promotion
    // instruction inside generateReplyIdeas, same as a post-card.tsx render
    // with no cached guideline for that subreddit.
    let guideline = null
    try {
      const guidelines = await getGuidelinesForSubreddits([post.subreddit])
      guideline = guidelines[0] ?? null
    } catch (err) {
      console.error('[posts reply-idea] Failed to load subreddit guideline:', err)
    }

    const spend = await deductCredits(userId, POST_CONTENT_IDEA_COST, 'post_reply_idea', id)
    if (!spend.ok) {
      await sql`
        UPDATE posts SET reply_ideas = NULL
        WHERE id = ${id} AND user_id = ${userId} AND reply_ideas = ${IN_PROGRESS}::jsonb
      `
      return NextResponse.json(
        {
          error: `Not enough credits (need ${POST_CONTENT_IDEA_COST}, have ${spend.balance}).`,
          need: POST_CONTENT_IDEA_COST,
          have: spend.balance,
        },
        { status: 402 }
      )
    }
    credited = true

    const replies = await generateReplyIdeas(post, guideline, campaign.product_description)
    if (replies.length === 0) {
      // Nothing usable came back — refund rather than charge, since this
      // deducts up front before knowing the model will find an angle. A
      // fresh random ref_id per attempt (not a fixed `${id}:empty`): the
      // claim above already makes at most one attempt outstanding at a time
      // for this post, so refunding two separate failed attempts must not
      // collide on one ref_id and have the second silently drop (that would
      // leave the second attempt's charge stranded with no refund) the way a
      // stable per-post ref_id would under credit_ledger_refund_ref_id_idx.
      await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:empty:${randomUUID()}`)
      await sql`
        UPDATE posts SET reply_ideas = NULL
        WHERE id = ${id} AND user_id = ${userId} AND reply_ideas = ${IN_PROGRESS}::jsonb
      `
      return NextResponse.json({ replies })
    }

    await sql`
      UPDATE posts SET reply_ideas = ${JSON.stringify(replies)}::jsonb
      WHERE id = ${id} AND user_id = ${userId} AND reply_ideas = ${IN_PROGRESS}::jsonb
    `
    return NextResponse.json({ replies })
  } catch (err) {
    console.error('[posts reply-idea] Failed to generate reply ideas:', err)
    if (credited) {
      await refundCredits(userId, POST_CONTENT_IDEA_COST, `${id}:error:${randomUUID()}`)
    }
    await sql`
      UPDATE posts SET reply_ideas = NULL
      WHERE id = ${id} AND user_id = ${userId} AND reply_ideas = ${IN_PROGRESS}::jsonb
    `
    return NextResponse.json({ error: 'idea_failed' }, { status: 500 })
  }
}
