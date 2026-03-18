import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 minutes

export async function POST() {
  const userId = process.env.DEFAULT_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'DEFAULT_USER_ID not set' }, { status: 500 })
  }

  // Rate limit: check last scrape job
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

  // Trigger the cron endpoint internally
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/cron/scrape`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
