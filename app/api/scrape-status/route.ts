import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireUserId } from '@/lib/auth'

const FREQUENCY_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
}

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  const [{ data: lastJob }, { data: config }, { count: newCount }] = await Promise.all([
    supabaseAdmin
      .from('scrape_jobs')
      .select('started_at, finished_at, posts_found, error_message')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single(),
    supabaseAdmin
      .from('config')
      .select('scrape_frequency')
      .eq('user_id', userId)
      .single(),
    supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'new'),
  ])

  const frequency = config?.scrape_frequency ?? '2h'
  const freqMs = FREQUENCY_MS[frequency]
  const lastRun = lastJob?.started_at ?? null
  const nextRun = lastRun ? new Date(new Date(lastRun).getTime() + freqMs).toISOString() : null

  return NextResponse.json({
    last_run: lastRun,
    next_run: nextRun,
    new_posts: newCount ?? 0,
    last_job: lastJob ?? null,
  })
}
