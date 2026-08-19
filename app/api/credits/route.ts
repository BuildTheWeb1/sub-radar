import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { getCreditBalance } from '@/lib/credits'

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const balance = await getCreditBalance(userId)
    return NextResponse.json({ balance })
  } catch (err) {
    console.error('[credits GET] Failed to load balance:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
