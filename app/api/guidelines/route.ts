import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/auth'
import { getOrCreateCampaign } from '@/lib/campaigns'
import { getGuidelinesForSubreddits } from '@/lib/guidelines'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const result = await requireUserId()
  if (result instanceof NextResponse) return result
  const userId = result

  try {
    const campaign = await getOrCreateCampaign(userId)

    if (!campaign.subreddits || campaign.subreddits.length === 0) {
      return NextResponse.json([])
    }

    const guidelines = await getGuidelinesForSubreddits(campaign.subreddits)
    return NextResponse.json(guidelines)
  } catch (err) {
    console.error('[guidelines GET] Failed to load guidelines:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
