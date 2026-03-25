import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireUserId } from '@/lib/auth'
import { DEFAULT_CONFIG } from '@/lib/defaults'

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const { data, error } = await supabaseAdmin
    .from('config')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code === 'PGRST116') {
    // No config yet — seed defaults
    const { data: created, error: insertError } = await supabaseAdmin
      .from('config')
      .insert({ user_id: userId, ...DEFAULT_CONFIG })
      .select()
      .single()
    if (insertError) {
      console.error('[config GET] Failed to seed defaults:', insertError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    return NextResponse.json(created)
  }

  if (error) {
    console.error('[config GET] Failed to load config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const body = await req.json()
  const { subreddits, keywords, product_description, scrape_frequency, min_relevance } = body

  // Validation
  const SUBREDDIT_RE = /^[a-zA-Z0-9_]{1,21}$/
  if (!Array.isArray(subreddits) || subreddits.length > 10) {
    return NextResponse.json({ error: 'Max 10 subreddits' }, { status: 400 })
  }
  if (subreddits.some((s: unknown) => typeof s !== 'string' || !SUBREDDIT_RE.test(s))) {
    return NextResponse.json({ error: 'Invalid subreddit name (letters, numbers, underscores, 1–21 chars)' }, { status: 400 })
  }
  if (!Array.isArray(keywords) || keywords.length > 20) {
    return NextResponse.json({ error: 'Max 20 keywords' }, { status: 400 })
  }
  if (keywords.some((k: unknown) => typeof k !== 'string' || k.length === 0 || k.length > 100)) {
    return NextResponse.json({ error: 'Each keyword must be 1–100 characters' }, { status: 400 })
  }
  if (typeof product_description !== 'string' || product_description.length > 2000) {
    return NextResponse.json({ error: 'product_description must be a string under 2000 characters' }, { status: 400 })
  }
  if (!['1h', '2h', '6h', '12h'].includes(scrape_frequency)) {
    return NextResponse.json({ error: 'Invalid scrape_frequency' }, { status: 400 })
  }
  if (typeof min_relevance !== 'number' || !Number.isFinite(min_relevance) || min_relevance < 0 || min_relevance > 100) {
    return NextResponse.json({ error: 'min_relevance must be a number between 0 and 100' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('config')
    .upsert(
      { user_id: userId, subreddits, keywords, product_description, scrape_frequency, min_relevance, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('[config POST] Failed to upsert config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(data)
}
