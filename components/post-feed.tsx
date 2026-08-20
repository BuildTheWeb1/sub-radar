'use client'

import { useCallback, useEffect, useState } from 'react'
import { Post, PostStatus, SubredditGuideline } from '@/lib/types'
import { PostCard } from './post-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { Inbox, Lightbulb } from 'lucide-react'
import { SCRAPE_FINISHED_EVENT } from './scraper-bar'

interface Filters {
  status?: string
  sortBy?: string
  minRelevance?: string
  subreddits?: string
}

interface PostFeedProps {
  defaultStatus?: string
  title: string
  /** Shows the status picker (New/Replied/Saved/Ignored/All) instead of a fixed
   * status. Only Leads sets this — Saved keeps its own dedicated, always-saved view. */
  statusFilterable?: boolean
  /** Shows a low-key link into Content Ideas. Only Leads sets this — it's the one
   * place a user is already looking at real posts and might want to write about them. */
  showContentIdeasLink?: boolean
  /** Initial relevance floor. Only Leads raises this (see the page's own comment) —
   * Saved and the Replied filter must default to 0, since a post the user already
   * bookmarked or replied to shouldn't disappear because it scored low. */
  defaultMinRelevance?: string
}

const LIMIT = 25

export function PostFeed({
  defaultStatus,
  title,
  statusFilterable,
  showContentIdeasLink,
  defaultMinRelevance,
}: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [guidelines, setGuidelines] = useState<Record<string, SubredditGuideline>>({})
  const [filters, setFilters] = useState<Filters>({
    status: defaultStatus ?? 'all',
    sortBy: 'relevance',
    minRelevance: defaultMinRelevance ?? '0',
  })

  const fetchPosts = useCallback(
    async (currentOffset = 0, replace = true) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(currentOffset),
        })
        if (filters.status && filters.status !== 'all') params.set('status', filters.status)
        if (filters.sortBy) params.set('sortBy', filters.sortBy)
        if (filters.minRelevance && filters.minRelevance !== '0')
          params.set('minRelevance', filters.minRelevance)
        if (filters.subreddits) params.set('subreddits', filters.subreddits)

        const res = await fetch(`/api/posts?${params}`)
        const data = await res.json()
        setPosts((prev) => (replace ? data.posts ?? [] : [...prev, ...(data.posts ?? [])]))
        setTotal(data.total ?? 0)
      } finally {
        setLoading(false)
      }
    },
    [filters]
  )

  useEffect(() => {
    setOffset(0)
    fetchPosts(0, true)
  }, [fetchPosts])

  // When the ScraperBar sees a job close, pull the new rows in rather than leaving
  // the user looking at a stale list with no hint that anything arrived.
  useEffect(() => {
    function onScrapeFinished() {
      setOffset(0)
      fetchPosts(0, true)
    }
    window.addEventListener(SCRAPE_FINISHED_EVENT, onScrapeFinished)
    return () => window.removeEventListener(SCRAPE_FINISHED_EVENT, onScrapeFinished)
  }, [fetchPosts])

  useEffect(() => {
    let cancelled = false
    fetch('/api/guidelines')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SubredditGuideline[]) => {
        if (cancelled || !Array.isArray(data)) return
        const map: Record<string, SubredditGuideline> = {}
        for (const g of data) {
          if (g?.subreddit) map[g.subreddit.toLowerCase()] = g
        }
        setGuidelines(map)
      })
      .catch(() => {
        // No guidelines available — cards simply render without a risk badge.
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleStatusChange(id: string, status: PostStatus) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  function loadMore() {
    const next = offset + LIMIT
    setOffset(next)
    fetchPosts(next, false)
  }

  const hasMore = posts.length < total

  return (
    <div className="space-y-4">
      {/* Header + controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{title}</h1>
            {showContentIdeasLink && (
              <Link
                href="/dashboard/content-ideas"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Content ideas
              </Link>
            )}
          </div>
          {loading && posts.length === 0 ? (
            <Skeleton className="h-3 w-32 mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground">
              Showing {posts.length} of {total} posts
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {statusFilterable && (
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v ?? undefined }))}
            >
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="saved">Saved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select
            value={filters.sortBy}
            onValueChange={(v) => setFilters((f) => ({ ...f, sortBy: v ?? undefined }))}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Keyword match</SelectItem>
              <SelectItem value="upvotes">Upvotes</SelectItem>
              <SelectItem value="comments">Comments</SelectItem>
              <SelectItem value="recent">Recent</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.minRelevance}
            onValueChange={(v) => setFilters((f) => ({ ...f, minRelevance: v ?? undefined }))}
          >
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Min keyword match" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All scores</SelectItem>
              <SelectItem value="20">Score ≥ 20</SelectItem>
              <SelectItem value="40">Score ≥ 40</SelectItem>
              <SelectItem value="60">Score ≥ 60</SelectItem>
              <SelectItem value="80">Score ≥ 80</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Post list */}
      {loading && posts.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-brand-surface-border bg-brand-surface px-4 py-4">
          <Inbox className="h-5 w-5 mt-0.5 shrink-0 text-brand-text-muted" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-brand-text">Nothing here yet</p>
            <p className="text-sm text-brand-text-muted max-w-prose">
              Either no post matched your keywords, or the filters above are too narrow — try{' '}
              <button
                onClick={() => setFilters((f) => ({ ...f, minRelevance: '0' }))}
                className="font-medium text-brand-accent hover:underline"
              >
                All scores
              </button>
              . Or{' '}
              <Link href="/dashboard/radar" className="font-medium text-brand-accent hover:underline">
                check what you&apos;re watching
              </Link>{' '}
              to add subreddits and keywords.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onStatusChange={handleStatusChange}
              guideline={guidelines[post.subreddit.toLowerCase()]}
            />
          ))}
          {hasMore && (
            <div className="pt-2 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
