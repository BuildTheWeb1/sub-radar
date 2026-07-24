import { NextRequest, NextResponse, after } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 minutes

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  // Target campaign can come from the request body or a query param.
  let campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!campaignId) {
    try {
      const body = await req.json()
      campaignId = body?.campaignId ?? null
    } catch {
      // no JSON body provided — fall through to the missing-campaignId check below
    }
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  // Verify the campaign exists and belongs to this user
  let campaign: { id: string; user_id: string } | null = null
  try {
    const rows = (await sql`
      SELECT id, user_id FROM campaigns
      WHERE id = ${campaignId} AND user_id = ${userId}
    `) as { id: string; user_id: string }[]
    campaign = rows[0] ?? null
  } catch (campaignError) {
    console.error('[trigger] Failed to look up campaign:', campaignError)
  }

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Rate limit: atomically insert a job record, then check if there was a recent one.
  // We insert the job here (not in the cron route) so concurrent requests see it
  // immediately, closing the TOCTOU race condition.
  let lastJob: { started_at: string } | null = null
  try {
    const rows = (await sql`
      SELECT started_at FROM scrape_jobs
      WHERE user_id = ${userId}
      ORDER BY started_at DESC
      LIMIT 1
    `) as { started_at: string }[]
    lastJob = rows[0] ?? null
  } catch {
    // Mirrors the original behavior: the rate-limit lookup's result is used only
    // if present — any failure here is treated as "no prior job" and ignored.
  }

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
  let job: { id: string } | null = null
  try {
    const rows = (await sql`
      INSERT INTO scrape_jobs (user_id) VALUES (${userId}) RETURNING *
    `) as { id: string }[]
    job = rows[0] ?? null
  } catch (jobError) {
    console.error('[trigger] Failed to create job record:', jobError)
  }

  if (!job) {
    return NextResponse.json({ error: 'Failed to start scrape job' }, { status: 500 })
  }

  // Fire off the cron scrape without awaiting — it runs as an independent request.
  // The client polls /api/scrape-status to detect completion.
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Guard: warn if transmitting CRON_SECRET over plain HTTP in non-development
  if (process.env.NODE_ENV !== 'development' && !baseUrl.startsWith('https://')) {
    console.warn('[trigger] WARNING: NEXTAUTH_URL is not HTTPS. CRON_SECRET may be transmitted insecurely.')
  }

  // Keep the serverless function alive until the cron fetch is dispatched.
  // Without after(), the invocation can be frozen once the response is sent,
  // killing the background scrape before it starts.
  after(async () => {
    try {
      await fetch(
        `${baseUrl}/api/cron/scrape?campaignId=${campaignId}&userId=${userId}&jobId=${job.id}`,
        { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }
      )
    } catch (err) {
      console.error('[trigger] cron fetch error:', err)
    }
  })

  return NextResponse.json({ ok: true, started: true })
}
