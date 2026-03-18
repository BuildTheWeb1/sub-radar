import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { PostStatus } from '@/lib/types'

const VALID_STATUSES: PostStatus[] = ['new', 'replied', 'ignored', 'saved']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = process.env.DEFAULT_USER_ID

  if (!userId) {
    return NextResponse.json({ error: 'DEFAULT_USER_ID not set' }, { status: 500 })
  }

  const body = await req.json()
  const { status } = body as { status: PostStatus }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
