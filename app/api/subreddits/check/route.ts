import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { checkSubreddits } from '@/lib/guidelines'

export const runtime = 'nodejs'
// Uncached names are spaced 2s apart to avoid tripping Reddit's block, so a full
// batch of 8 can legitimately take ~20s.
export const maxDuration = 60

// Each uncached name costs two Reddit calls plus a 2s gap from the previous one.
// Eight keeps the worst case inside maxDuration even when Reddit is retrying.
const MAX_NAMES = 8

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result

  const body = await req.json().catch(() => ({}))
  const { names } = body

  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: 'names must be a non-empty array' }, { status: 400 })
  }
  if (names.length > MAX_NAMES) {
    return NextResponse.json({ error: `At most ${MAX_NAMES} names per request` }, { status: 400 })
  }
  if (names.some((n: unknown) => typeof n !== 'string' || n.length > 40)) {
    return NextResponse.json({ error: 'Each name must be a string under 40 characters' }, { status: 400 })
  }

  try {
    const checks = await checkSubreddits(names as string[])
    return NextResponse.json(checks)
  } catch (err) {
    console.error('[subreddits/check POST] Failed:', err)
    return NextResponse.json({ error: 'check_failed' }, { status: 500 })
  }
}
