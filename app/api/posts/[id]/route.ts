import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { requireUserId } from '@/lib/auth'
import { PostStatus, Post } from '@/lib/types'

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

  try {
    const rows = (await sql`
      UPDATE posts
      SET status = ${status}
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `) as Post[]
    const data = rows[0] ?? null

    // Mirror the old .single() behavior: no matching row (wrong id or not
    // owned by this user) is treated the same as a query error.
    if (!data) {
      console.error('[posts PATCH] Failed to update post: no row matched (id/user_id mismatch)')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[posts PATCH] Failed to update post:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
