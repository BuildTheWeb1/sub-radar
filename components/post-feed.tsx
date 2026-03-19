'use client'

import { useCallback, useEffect, useState } from 'react'
import { Post, PostStatus } from '@/lib/types'
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
import { Inbox } from 'lucide-react'

interface Filters {
  status?: string
  sortBy?: string
  minRelevance?: string
  subreddits?: string
}

interface PostFeedProps {
  defaultStatus?: string
  title: string
}

const LIMIT = 25

export function PostFeed({ defaultStatus, title }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<Filters>({
    status: defaultStatus ?? 'all',
    sortBy: 'relevance',
    minRelevance: '0',
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
          <h1 className="text-lg font-semibold">{title}</h1>
          {!loading && (
            <p className="text-xs text-muted-foreground">
              Showing {posts.length} of {total} posts
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={filters.sortBy}
            onValueChange={(v) => setFilters((f) => ({ ...f, sortBy: v ?? undefined }))}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
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
              <SelectValue placeholder="Min relevance" />
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
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Inbox className="h-10 w-10 text-[#fde8cc]" />
          <p className="text-sm font-semibold text-[#431407]">No posts found</p>
          <p className="text-xs text-[#9a6b4b]">Adjust filters or wait for the next scrape.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onStatusChange={handleStatusChange} />
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
