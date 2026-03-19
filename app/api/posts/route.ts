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
  const status = searchParams.get('status')
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const subreddits = searchParams.get('subreddits')
  if (subreddits) {
    query = query.in('subreddit', subreddits.split(','))
  }

  const minRelevance = searchParams.get('minRelevance')
  if (minRelevance) {
    query = query.gte('relevance_score', parseInt(minRelevance))
  }

  const dateFrom = searchParams.get('dateFrom')
  if (dateFrom) {
    query = query.gte('posted_at', dateFrom)
  }

  const dateTo = searchParams.get('dateTo')
  if (dateTo) {
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

  // Pagination
  const limit = parseInt(searchParams.get('limit') || '25')
  const offset = parseInt(searchParams.get('offset') || '0')
  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ posts: data, total: count })
}
