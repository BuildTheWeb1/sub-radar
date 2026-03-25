import { NextRequest, NextResponse } from 'next/server'
import { scrape } from '@/lib/scraper'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60 // 60 seconds (Vercel Hobby max)

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron or the internal trigger
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Support targeting a specific user (from the manual trigger route)
  const targetUserId = req.nextUrl.searchParams.get('userId')

  // Accept a pre-created jobId from the trigger route to avoid a duplicate insert
  // and close the rate-limit race condition. When called by Vercel Cron directly,
  // no jobId is provided and we create one per user as before.
  const preCreatedJobId = req.nextUrl.searchParams.get('jobId')

  // Load configs — either one user or all users
  let configQuery = supabaseAdmin.from('config').select('*')
  if (targetUserId) configQuery = configQuery.eq('user_id', targetUserId)

  const { data: configs, error: configError } = await configQuery
  if (configError || !configs?.length) {
    return NextResponse.json({ error: 'No config found' }, { status: 404 })
  }

  let totalInserted = 0

  for (const config of configs) {
    const userId = config.user_id

    // Use the pre-created job record when available (manual trigger), otherwise
    // create a new one (Vercel Cron scheduled run).
    let jobId: string | undefined
    if (preCreatedJobId && targetUserId === userId) {
      jobId = preCreatedJobId
    } else {
      const { data: job } = await supabaseAdmin
        .from('scrape_jobs')
        .insert({ user_id: userId })
        .select()
        .single()
      jobId = job?.id
    }

    try {
      const posts = await scrape(config.subreddits, config.keywords, (msg) => {
        console.log(`[${userId}] ${msg}`)
      })

      let inserted = 0
      for (const post of posts) {
        if (post.relevance_score < config.min_relevance) continue

        const { error } = await supabaseAdmin.from('posts').upsert(
          { ...post, user_id: userId },
          { onConflict: 'user_id,reddit_id', ignoreDuplicates: true }
        )
        if (!error) inserted++
      }

      if (jobId) {
        await supabaseAdmin
          .from('scrape_jobs')
          .update({ finished_at: new Date().toISOString(), posts_found: inserted })
          .eq('id', jobId)
      }

      totalInserted += inserted
    } catch (err) {
      const message = (err as Error).message
      console.error(`[cron] Scrape error for user ${userId}:`, message)

      if (jobId) {
        await supabaseAdmin
          .from('scrape_jobs')
          .update({ finished_at: new Date().toISOString(), error_message: message })
          .eq('id', jobId)
      }
    }
  }

  return NextResponse.json({ ok: true, posts_found: totalInserted })
}
