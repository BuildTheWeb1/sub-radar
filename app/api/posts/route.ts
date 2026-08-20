import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import type { Post } from '@/lib/types'

export async function GET(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const { searchParams } = req.nextUrl

  // Filters
  const VALID_STATUSES = ['new', 'replied', 'ignored', 'saved'] as const
  const status = searchParams.get('status')
  let statusFilter: string | null = null
  if (status && status !== 'all') {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    statusFilter = status
  }

  let subredditsFilter: string[] | null = null
  const subreddits = searchParams.get('subreddits')
  if (subreddits) {
    subredditsFilter = subreddits.split(',').slice(0, 50)
  }

  let minRelevanceFilter: number | null = null
  const minRelevance = searchParams.get('minRelevance')
  if (minRelevance !== null) {
    const parsed = parseInt(minRelevance, 10)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      minRelevanceFilter = parsed
    }
  }

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/
  let dateFromFilter: string | null = null
  const dateFrom = searchParams.get('dateFrom')
  if (dateFrom && ISO_DATE_RE.test(dateFrom)) {
    dateFromFilter = dateFrom
  }

  let dateToFilter: string | null = null
  const dateTo = searchParams.get('dateTo')
  if (dateTo && ISO_DATE_RE.test(dateTo)) {
    dateToFilter = dateTo
  }

  // Sort — whitelist ORDER BY clause, never interpolate the column name.
  const sortBy = searchParams.get('sortBy') || 'relevance'
  const sortMap: Record<string, string> = {
    relevance: 'relevance_score DESC',
    upvotes: 'upvotes DESC',
    comments: 'num_comments DESC',
    recent: 'posted_at DESC',
  }
  const orderByClause = sortMap[sortBy] ?? sortMap.relevance

  // Pagination — clamp to safe bounds
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25') || 25, 1), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0') || 0, 0)

  try {
    // All optional filters are expressed as `(${param}::type IS NULL OR col = ${param})`
    // so a single parameterized query covers every combination safely.
    // orderByClause is picked from a fixed, hardcoded whitelist map above (never
    // derived from raw user input), so sql.unsafe() here is safe.
    //
    // Posts older than 21 days are dropped from the "new" queue, matching the
    // same cutoff scrapeOnePair (lib/scraper.ts) applies before inserting a
    // post — a thread this old is dead, the OP has moved on, replying reads as
    // necroposting. `OR status != 'new'` exempts posts the user has already
    // acted on (Replied, Saved, even Ignored): those are deliberate history,
    // not a lead queue, and must not vanish just because time passed.
    const dataQuery = sql`
      SELECT * FROM posts
      WHERE user_id = ${userId}
        AND (posted_at >= now() - interval '21 days' OR status != 'new')
        AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
        AND (${subredditsFilter}::text[] IS NULL OR subreddit = ANY(${subredditsFilter}))
        AND (${minRelevanceFilter}::int IS NULL OR relevance_score >= ${minRelevanceFilter})
        AND (${dateFromFilter}::text IS NULL OR posted_at >= ${dateFromFilter})
        AND (${dateToFilter}::text IS NULL OR posted_at <= ${dateToFilter})
      ORDER BY ${sql.unsafe(orderByClause)}
      LIMIT ${limit} OFFSET ${offset}
    `

    const countQuery = sql`
      SELECT count(*)::int AS count FROM posts
      WHERE user_id = ${userId}
        AND (posted_at >= now() - interval '21 days' OR status != 'new')
        AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
        AND (${subredditsFilter}::text[] IS NULL OR subreddit = ANY(${subredditsFilter}))
        AND (${minRelevanceFilter}::int IS NULL OR relevance_score >= ${minRelevanceFilter})
        AND (${dateFromFilter}::text IS NULL OR posted_at >= ${dateFromFilter})
        AND (${dateToFilter}::text IS NULL OR posted_at <= ${dateToFilter})
    `

    const [data, countRows] = await Promise.all([dataQuery, countQuery])
    const count = (countRows as { count: number }[])[0]?.count ?? 0

    return NextResponse.json({ posts: data as Post[], total: count })
  } catch (err) {
    console.error('[posts GET] Failed to query posts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
