'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BanRiskBadge } from '@/components/ban-risk-badge'
import { Post, PostStatus, SubredditGuideline } from '@/lib/types'
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

interface PostIdea {
  hook: string
  angle: string
  format: string
}

export function PostCard({ post, onStatusChange, guideline }: PostCardProps) {
  const [loading, setLoading] = useState<PostStatus | null>(null)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [ideaLoading, setIdeaLoading] = useState(false)
  const [ideaError, setIdeaError] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<PostIdea[] | null>(null)

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

  async function generateIdea() {
    if (ideaLoading) return
    if (ideas) {
      setIdeaOpen((v) => !v)
      return
    }
    setIdeaOpen(true)
    setIdeaLoading(true)
    setIdeaError(null)
    try {
      const res = await fetch(`/api/posts/${post.id}/content-idea`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Same surfacing convention as subreddit-suggester.tsx: map known
        // status codes/error strings to something a user can act on rather
        // than showing the raw code (e.g. "idea_failed") verbatim.
        if (res.status === 402) {
          setIdeaError(data.error || 'Not enough credits to generate a content idea.')
        } else if (data.error === 'idea_failed') {
          setIdeaError('The idea generator did not respond. Try again in a moment.')
        } else {
          setIdeaError(`Content idea failed (${res.status}). Try again in a moment.`)
        }
        return
      }
      setIdeas(data.postIdeas ?? [])
    } catch {
      setIdeaError('Content idea failed. Try again in a moment.')
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
        <span>{pluralize(post.upvotes, 'point')}</span>
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
            <Lightbulb className="h-3 w-3" />
            {ideaLoading ? '...' : 'Content idea'}
          </TooltipTrigger>
          <TooltipContent>
            {ideas
              ? 'Toggle the ideas already generated for this post'
              : `Generates 3 post ideas from this post — ${pluralize(POST_CONTENT_IDEA_COST, 'credit')}`}
          </TooltipContent>
        </Tooltip>
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
            {!ideaLoading && !ideaError && ideas && ideas.length === 0 && (
              <p className="text-xs text-brand-text-muted">
                Couldn&apos;t find a usable angle in this post.
              </p>
            )}
            {!ideaLoading && !ideaError && ideas && ideas.length > 0 && (
              <ul className="space-y-2">
                {ideas.map((idea, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium text-brand-text">{idea.hook}</span>{' '}
                    <span className="text-brand-text-muted">— {idea.angle}</span>{' '}
                    <span className="text-brand-text-muted">({idea.format})</span>
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
