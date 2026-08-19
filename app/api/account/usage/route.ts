import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { getLeadsThisMonth } from '@/lib/stats'

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const leadsThisMonth = await getLeadsThisMonth(userId)
    return NextResponse.json({ leadsThisMonth })
  } catch (err) {
    console.error('[account/usage GET] Failed to load usage:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
