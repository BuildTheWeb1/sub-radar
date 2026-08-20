'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BanRiskBadge } from '@/components/ban-risk-badge'
import { Post, PostStatus, SubredditGuideline, ReplyIdea } from '@/lib/types'
import {
  ExternalLink,
  CheckCircle,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Lightbulb,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { pluralize } from '@/lib/utils'
import { POST_CONTENT_IDEA_COST } from '@/lib/credit-costs'
import { showInsufficientCreditsToast } from '@/lib/insufficient-credits-toast'

interface PostCardProps {
  post: Post
  onStatusChange?: (id: string, status: PostStatus) => void
  guideline?: SubredditGuideline
}

const SELF_PROMO_LABEL: Record<SubredditGuideline['self_promo_policy'], string> = {
  allowed: 'Self-promo OK here.',
  limited: 'Value-first replies only — keep pitches light.',
  banned: 'No self-promo or links — reply as a genuine participant, not a marketer.',
  unknown: "Self-promo policy isn't known — read the room before pitching.",
}

// Same three-tier palette as BanRiskBadge's risk levels (ban-risk-badge.tsx) — relevance and
// ban-risk are the card's two status signals and now share one color language.
function relevanceColor(score: number) {
  if (score >= 70) return 'bg-green-100 text-green-800'
  if (score >= 40) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-brand-accent-strong'
}

// The score itself is unlabeled in the badge (just a bare number, to stay
// compact) — this is what the tooltip below fills in. Labeled "keyword match"
// rather than "relevance": the score is a literal keyword-occurrence count
// (see scoreRelevance in lib/scraper.ts), not a judgment of topical fit, and
// naming it otherwise overstates what it actually measures.
function relevanceLabel(score: number) {
  if (score >= 70) return 'Strong keyword match'
  if (score >= 40) return 'Some keyword overlap'
  return 'Weak keyword match'
}

function statusBadgeVariant(status: PostStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'replied') return 'default'
  if (status === 'saved') return 'secondary'
  return 'outline'
}

export function PostCard({ post, onStatusChange, guideline }: PostCardProps) {
  const [loading, setLoading] = useState<PostStatus | null>(null)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [ideaLoading, setIdeaLoading] = useState(false)
  const [ideaError, setIdeaError] = useState<string | null>(null)
  // Seeded from the post row (persisted server-side by /api/posts/[id]/reply-idea)
  // rather than always starting null, so a previously generated reply survives a
  // page refresh — it's only cleared when a new scan cycle resets reply_ideas
  // to NULL for every post in the campaign (see clearReplyIdeasStep).
  const [replies, setReplies] = useState<ReplyIdea[] | null>(post.reply_ideas)
  // `post-feed.tsx` keeps this card mounted across a re-fetch (same key =
  // post.id), so a plain `useState(post.reply_ideas)` only reads the prop
  // once at mount and never again — a tab left open through a scan cycle
  // would keep showing a locked button over a draft that's already been
  // cleared server-side. This is React's documented "adjusting state during
  // render" pattern: resync `replies` whenever the incoming prop identity
  // actually changes (a fresh /api/posts fetch always returns new array
  // instances), rather than only at mount. Safe against clobbering a
  // just-generated draft because generateIdea()'s own persist UPDATE is
  // awaited server-side before its response — and thus this component's own
  // setReplies(fresh) call below — ever fires.
  const [seenReplyIdeas, setSeenReplyIdeas] = useState(post.reply_ideas)
  if (post.reply_ideas !== seenReplyIdeas) {
    setSeenReplyIdeas(post.reply_ideas)
    setReplies(post.reply_ideas)
    if (!post.reply_ideas) {
      setIdeaOpen(false)
      setIdeaError(null)
    }
  }

  async function updateStatus(status: PostStatus) {
    if (loading) return
    setLoading(status)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      onStatusChange?.(post.id, status)
      toast.success(`Marked as ${status}`)
    } catch {
      toast.error('Failed to update post')
    } finally {
      setLoading(null)
    }
  }

  // A post gets exactly one reply-idea generation per scan cycle: `replies`
  // is set to a non-empty array only on a 2xx response that actually returned
  // something, at which point the button below disables and a chevron takes
  // over for re-opening the (already-paid-for, now persisted) result. A
  // failed attempt (network error, 402, 500) OR a 2xx with zero usable
  // replies leaves `replies` null on purpose — the backend refunds the credit
  // for both, so the button must stay enabled and let the user retry rather
  // than locking on a request that produced nothing.
  const generated = replies !== null && replies.length > 0

  async function generateIdea() {
    if (ideaLoading || generated) return
    setIdeaOpen(true)
    setIdeaLoading(true)
    setIdeaError(null)
    try {
      const res = await fetch(`/api/posts/${post.id}/reply-idea`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Same surfacing convention as subreddit-suggester.tsx: map known
        // status codes/error strings to something a user can act on rather
        // than showing the raw code (e.g. "idea_failed") verbatim.
        if (res.status === 402) {
          setIdeaError(data.error || 'Not enough credits to generate a reply idea.')
          if (typeof data.need === 'number' && typeof data.have === 'number') {
            showInsufficientCreditsToast(data.need, data.have)
          }
        } else if (data.error === 'idea_failed') {
          setIdeaError('The idea generator did not respond. Try again in a moment.')
        } else {
          setIdeaError(`Reply idea failed (${res.status}). Try again in a moment.`)
        }
        return
      }
      const fresh: ReplyIdea[] = data.replies ?? []
      if (fresh.length === 0) {
        // Refunded server-side (see reply-idea/route.ts) — don't lock the
        // button on a generation that found nothing to work with.
        setIdeaError("Couldn't find a usable angle in this post. Try again in a moment.")
        return
      }
      setReplies(fresh)
    } catch {
      setIdeaError('Reply idea failed. Try again in a moment.')
    } finally {
      setIdeaLoading(false)
    }
  }

  const timeAgo = formatDistanceToNow(new Date(post.posted_at), { addSuffix: true })

  return (
    <div className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-3 transition-colors duration-150 ease-out hover:border-brand-surface-border-hover" style={{ boxShadow: '0 1px 4px rgba(234,88,12,0.07)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm leading-snug hover:underline line-clamp-2"
          >
            {post.title}
          </a>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${relevanceColor(post.relevance_score)}`}
              />
            }
          >
            {post.relevance_score}
          </TooltipTrigger>
          <TooltipContent>
            {relevanceLabel(post.relevance_score)} — {post.relevance_score}/100, based on how many
            times your campaign&apos;s keywords appear in this post
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span className="font-semibold text-brand-accent">r/{post.subreddit}</span>
        {guideline?.risk && (
          <button
            onClick={() => setRuleOpen((v) => !v)}
            className="inline-flex items-center gap-0.5"
            aria-expanded={ruleOpen}
          >
            <BanRiskBadge risk={guideline.risk} />
            <ChevronDown
              className={`h-3 w-3 text-brand-text-muted transition-transform ${ruleOpen ? 'rotate-180' : ''}`}
            />
          </button>
        )}
        <span>·</span>
        <span>{pluralize(post.upvotes, 'upvote')}</span>
        <span>·</span>
        <span>{pluralize(post.num_comments, 'comment')}</span>
        <span>·</span>
        <span>{timeAgo}</span>
        {post.status !== 'new' && (
          <>
            <span>·</span>
            <Badge variant={statusBadgeVariant(post.status)} className="text-xs h-4">
              {post.status}
            </Badge>
          </>
        )}
      </div>

      {/* Distilled at the moment it matters — when the user is looking at a real
          post and deciding whether/how to reply — rather than once, up front, on
          the Radar targeting list where it's read once and forgotten. */}
      {guideline?.risk && (
        <div className="slide-message" data-open={ruleOpen}>
          <div>
            <p className="rounded-md bg-brand-foreground px-3 py-2 text-xs text-brand-text">
              {SELF_PROMO_LABEL[guideline.self_promo_policy]}
              {guideline.min_karma != null && ` Needs ${guideline.min_karma}+ karma.`}
              {guideline.cadence_note && ` ${guideline.cadence_note}`}
            </p>
          </div>
        </div>
      )}

      {post.body && (
        <p className="text-xs text-muted-foreground line-clamp-2">{post.body}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-brand-surface-border text-brand-text-muted hover:bg-brand-foreground"
          disabled={post.status === 'replied' || loading !== null}
          onClick={() => updateStatus('replied')}
        >
          <CheckCircle className="h-3 w-3" />
          {loading === 'replied' ? '...' : post.status === 'replied' ? 'Replied' : 'Mark replied'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-brand-surface-border text-brand-text-muted hover:bg-brand-foreground"
          disabled={post.status === 'ignored' || loading !== null}
          onClick={() => updateStatus('ignored')}
        >
          <EyeOff className="h-3 w-3" />
          {loading === 'ignored' ? '...' : 'Ignore'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-brand-surface-border text-brand-text-muted hover:bg-brand-foreground"
          disabled={loading !== null}
          onClick={() => updateStatus(post.status === 'saved' ? 'new' : 'saved')}
        >
          {post.status === 'saved' ? (
            <BookmarkCheck className="h-3 w-3" />
          ) : (
            <Bookmark className="h-3 w-3" />
          )}
          {loading === 'saved' ? '...' : post.status === 'saved' ? 'Saved' : 'Save'}
        </Button>
        {generated ? (
          // A native `disabled` button never fires hover/focus, so a tooltip
          // on it is unreachable — the explanation lives on the chevron
          // instead, which stays interactive.
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-brand-surface-border text-brand-text-muted disabled:opacity-60"
            disabled
          >
            <Lightbulb className="h-3 w-3" />
            Reply idea
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-brand-surface-border text-brand-text-muted hover:bg-brand-foreground"
                  disabled={ideaLoading}
                  onClick={generateIdea}
                />
              }
            >
              <Lightbulb className={`h-3 w-3 ${ideaLoading ? 'animate-breathe' : ''}`} />
              {ideaLoading ? 'Generating…' : 'Reply idea'}
            </TooltipTrigger>
            <TooltipContent>
              {`Drafts 3 reply comments for this post, respecting r/${post.subreddit}'s self-promo rules — ${pluralize(POST_CONTENT_IDEA_COST, 'credit')}, once until your next scan`}
            </TooltipContent>
          </Tooltip>
        )}
        {generated && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={() => setIdeaOpen((v) => !v)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-surface-border text-brand-text-muted hover:bg-brand-foreground"
                  aria-expanded={ideaOpen}
                  aria-label="Toggle reply idea details"
                />
              }
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${ideaOpen ? 'rotate-180' : ''}`}
              />
            </TooltipTrigger>
            <TooltipContent>
              {ideaOpen ? 'Hide the generated reply drafts' : 'Show the generated reply drafts'}
            </TooltipContent>
          </Tooltip>
        )}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto"
        >
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
            <ExternalLink className="h-3 w-3" />
            Open
          </Button>
        </a>
      </div>

      <div className="slide-message" data-open={ideaOpen}>
        <div>
          <div className="rounded-md bg-brand-foreground px-3 py-2.5 space-y-2">
            {ideaLoading && (
              <p className="text-xs text-brand-text-muted">Generating ideas from this post…</p>
            )}
            {!ideaLoading && ideaError && (
              <p className="text-xs text-brand-text-muted">{ideaError}</p>
            )}
            {!ideaLoading && !ideaError && replies && (
              <ul className="space-y-3">
                {replies.map((reply, i) => (
                  <li key={i} className="text-xs space-y-0.5">
                    <p className="text-brand-text">{reply.comment}</p>
                    <p className="text-brand-text-muted italic">{reply.angle}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
