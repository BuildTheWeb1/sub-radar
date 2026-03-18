'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Post, PostStatus } from '@/lib/types'
import { ExternalLink, CheckCircle, EyeOff, Bookmark, BookmarkCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface PostCardProps {
  post: Post
  onStatusChange?: (id: string, status: PostStatus) => void
}

function relevanceColor(score: number) {
  if (score >= 70) return 'bg-green-100 text-green-800'
  if (score >= 40) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function statusBadgeVariant(status: PostStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'replied') return 'default'
  if (status === 'saved') return 'secondary'
  return 'outline'
}

export function PostCard({ post, onStatusChange }: PostCardProps) {
  const [loading, setLoading] = useState<PostStatus | null>(null)

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
    <div className="rounded-lg border bg-card p-4 space-y-3 hover:border-foreground/20 transition-colors">
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
        <span className="font-medium text-foreground">r/{post.subreddit}</span>
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

      {post.body && (
        <p className="text-xs text-muted-foreground line-clamp-2">{post.body}</p>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={post.status === 'replied' || loading !== null}
          onClick={() => updateStatus('replied')}
        >
          <CheckCircle className="h-3 w-3" />
          {loading === 'replied' ? '...' : 'Replied'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={post.status === 'ignored' || loading !== null}
          onClick={() => updateStatus('ignored')}
        >
          <EyeOff className="h-3 w-3" />
          {loading === 'ignored' ? '...' : 'Ignore'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
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
