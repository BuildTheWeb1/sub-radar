'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BanRiskBadge } from '@/components/ban-risk-badge'
import { Post, PostStatus, SubredditGuideline } from '@/lib/types'
import { ExternalLink, CheckCircle, EyeOff, Bookmark, BookmarkCheck, ChevronDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

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

function statusBadgeVariant(status: PostStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'replied') return 'default'
  if (status === 'saved') return 'secondary'
  return 'outline'
}

export function PostCard({ post, onStatusChange, guideline }: PostCardProps) {
  const [loading, setLoading] = useState<PostStatus | null>(null)
  const [ruleOpen, setRuleOpen] = useState(false)

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
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${relevanceColor(post.relevance_score)}`}>
          {post.relevance_score}
        </span>
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
        <span>{post.upvotes} pts</span>
        <span>·</span>
        <span>{post.num_comments} comments</span>
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
          {loading === 'replied' ? '...' : 'Replied'}
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
    </div>
  )
}
