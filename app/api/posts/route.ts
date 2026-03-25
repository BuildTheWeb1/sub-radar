import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireUserId } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const { searchParams } = req.nextUrl

  let query = supabaseAdmin
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  // Filters
  const VALID_STATUSES = ['new', 'replied', 'ignored', 'saved'] as const
  const status = searchParams.get('status')
  if (status && status !== 'all') {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    query = query.eq('status', status)
  }

  const subreddits = searchParams.get('subreddits')
  if (subreddits) {
    query = query.in('subreddit', subreddits.split(',').slice(0, 50))
  }

  const minRelevance = searchParams.get('minRelevance')
  if (minRelevance !== null) {
    const parsed = parseInt(minRelevance, 10)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      query = query.gte('relevance_score', parsed)
    }
  }

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/
  const dateFrom = searchParams.get('dateFrom')
  if (dateFrom && ISO_DATE_RE.test(dateFrom)) {
    query = query.gte('posted_at', dateFrom)
  }

  const dateTo = searchParams.get('dateTo')
  if (dateTo && ISO_DATE_RE.test(dateTo)) {
    query = query.lte('posted_at', dateTo)
  }

  // Sort
  const sortBy = searchParams.get('sortBy') || 'relevance'
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    relevance: { col: 'relevance_score', asc: false },
    upvotes: { col: 'upvotes', asc: false },
    comments: { col: 'num_comments', asc: false },
    recent: { col: 'posted_at', asc: false },
  }
  const sort = sortMap[sortBy] ?? sortMap.relevance
  query = query.order(sort.col, { ascending: sort.asc })

  // Pagination — clamp to safe bounds
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25') || 25, 1), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0') || 0, 0)
  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    console.error('[posts GET] Failed to query posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ posts: data, total: count })
}
