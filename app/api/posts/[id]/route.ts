import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireUserId } from '@/lib/auth'
import { PostStatus } from '@/lib/types'

const VALID_STATUSES: PostStatus[] = ['new', 'replied', 'ignored', 'saved']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

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
    console.error('[posts PATCH] Failed to update post:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(data)
}
