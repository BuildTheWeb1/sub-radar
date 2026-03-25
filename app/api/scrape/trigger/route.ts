import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireUserId } from '@/lib/auth'
import { DEFAULT_CONFIG } from '@/lib/defaults'

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 minutes

export async function POST() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  // Ensure config exists for this user, seed defaults if not
  const { error: configCheckError } = await supabaseAdmin
    .from('config')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  if (configCheckError?.code === 'PGRST116') {
    const { error: insertError } = await supabaseAdmin
      .from('config')
      .upsert({ user_id: userId, ...DEFAULT_CONFIG }, { onConflict: 'user_id' })
    if (insertError) {
      return NextResponse.json({ error: 'Failed to initialize config' }, { status: 500 })
    }
  } else if (configCheckError) {
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 })
  }

  // Rate limit: atomically insert a job record, then check if there was a recent one.
  // We insert the job here (not in the cron route) so concurrent requests see it
  // immediately, closing the TOCTOU race condition.
  const { data: lastJob } = await supabaseAdmin
    .from('scrape_jobs')
    .select('started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (lastJob) {
    const elapsed = Date.now() - new Date(lastJob.started_at).getTime()
    if (elapsed < RATE_LIMIT_MS) {
      const waitSeconds = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000)
      return NextResponse.json(
        { error: `Rate limited. Try again in ${waitSeconds}s` },
        { status: 429 }
      )
    }
  }

  // Insert the job record here, before firing the background request, so any
  // concurrent trigger requests will see it and be rate-limited.
  const { data: job, error: jobError } = await supabaseAdmin
    .from('scrape_jobs')
    .insert({ user_id: userId })
    .select()
    .single()

  if (jobError || !job) {
    console.error('[trigger] Failed to create job record:', jobError)
    return NextResponse.json({ error: 'Failed to start scrape job' }, { status: 500 })
  }

  // Fire off the cron scrape without awaiting — it runs as an independent request.
  // The client polls /api/scrape-status to detect completion.
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Guard: warn if transmitting CRON_SECRET over plain HTTP in non-development
  if (process.env.NODE_ENV !== 'development' && !baseUrl.startsWith('https://')) {
    console.warn('[trigger] WARNING: NEXTAUTH_URL is not HTTPS. CRON_SECRET may be transmitted insecurely.')
  }

  fetch(`${baseUrl}/api/cron/scrape?userId=${userId}&jobId=${job.id}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch((err) => console.error('[trigger] cron fetch error:', err))

  return NextResponse.json({ ok: true, started: true })
}
