import { NextRequest, NextResponse } from 'next/server'
import { scrape } from '@/lib/scraper'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60 // 60 seconds (Vercel Hobby max)

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.DEFAULT_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'DEFAULT_USER_ID not set' }, { status: 500 })
  }

  // Load user config
  const { data: config, error: configError } = await supabaseAdmin
    .from('config')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (configError || !config) {
    return NextResponse.json({ error: 'No config found' }, { status: 404 })
  }

  // Log job start
  const { data: job } = await supabaseAdmin
    .from('scrape_jobs')
    .insert({ user_id: userId })
    .select()
    .single()

  const jobId = job?.id
  const logs: string[] = []

  try {
    const posts = await scrape(config.subreddits, config.keywords, (msg) => {
      logs.push(msg)
      console.log(msg)
    })

    // Upsert posts (deduplicate by user_id + reddit_id)
    let inserted = 0
    for (const post of posts) {
      if (post.relevance_score < config.min_relevance) continue

      const { error } = await supabaseAdmin.from('posts').upsert(
        { ...post, user_id: userId },
        { onConflict: 'user_id,reddit_id', ignoreDuplicates: true }
      )
      if (!error) inserted++
    }

    // Update job as complete
    if (jobId) {
      await supabaseAdmin
        .from('scrape_jobs')
        .update({ finished_at: new Date().toISOString(), posts_found: inserted })
        .eq('id', jobId)
    }

    return NextResponse.json({ ok: true, posts_found: inserted })
  } catch (err) {
    const message = (err as Error).message

    if (jobId) {
      await supabaseAdmin
        .from('scrape_jobs')
        .update({ finished_at: new Date().toISOString(), error_message: message })
        .eq('id', jobId)
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
