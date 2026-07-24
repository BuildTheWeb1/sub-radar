import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { suggestSubredditsAndKeywords } from '@/lib/onboarding'

export async function POST(req: NextRequest) {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result

  const body = await req.json()
  const { productDescription } = body

  if (typeof productDescription !== 'string' || productDescription.trim().length < 20) {
    return NextResponse.json(
      { error: 'productDescription must be a string of at least 20 characters' },
      { status: 400 }
    )
  }

  try {
    const suggestions = await suggestSubredditsAndKeywords(productDescription)
    return NextResponse.json(suggestions)
  } catch (err) {
    console.error('[onboarding/suggest POST] Failed to generate suggestions:', err)
    return NextResponse.json({ error: 'suggestion_failed' }, { status: 500 })
  }
}
