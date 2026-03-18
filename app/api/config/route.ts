import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const DEFAULT_CONFIG = {
  subreddits: ['intermittentfasting', 'fasting', 'OMAD', 'moodtracking', 'mentalhealth', 'selfimprovement', 'loseit', 'keto'],
  keywords: ['mood', 'mental clarity', 'brain fog', 'feel better', 'emotional', 'anxiety fasting', 'how do you feel', 'track mood', 'fasting benefits', 'mood swings', 'emotional eating', 'mindfulness fasting'],
  product_description: '',
  scrape_frequency: '2h',
  min_relevance: 20,
}

export async function GET() {
  const userId = process.env.DEFAULT_USER_ID
  if (!userId) return NextResponse.json({ error: 'DEFAULT_USER_ID not set' }, { status: 500 })

  const { data, error } = await supabaseAdmin
    .from('config')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code === 'PGRST116') {
    // No config yet — seed defaults
    const { data: created } = await supabaseAdmin
      .from('config')
      .insert({ user_id: userId, ...DEFAULT_CONFIG })
      .select()
      .single()
    return NextResponse.json(created)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const userId = process.env.DEFAULT_USER_ID
  if (!userId) return NextResponse.json({ error: 'DEFAULT_USER_ID not set' }, { status: 500 })

  const body = await req.json()
  const { subreddits, keywords, product_description, scrape_frequency, min_relevance } = body

  // Validation
  if (!Array.isArray(subreddits) || subreddits.length > 10) {
    return NextResponse.json({ error: 'Max 10 subreddits' }, { status: 400 })
  }
  if (!Array.isArray(keywords) || keywords.length > 20) {
    return NextResponse.json({ error: 'Max 20 keywords' }, { status: 400 })
  }
  if (!['1h', '2h', '6h', '12h'].includes(scrape_frequency)) {
    return NextResponse.json({ error: 'Invalid scrape_frequency' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('config')
    .upsert(
      { user_id: userId, subreddits, keywords, product_description, scrape_frequency, min_relevance, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
