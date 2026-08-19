import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { CREDIT_PACKS } from '@/lib/credit-costs'

export async function POST(req: NextRequest) {
  // Not requireUserId(): that helper re-runs getServerSession internally, and
  // this route also needs session.user.email for the Checkout receipt — one
  // call covers both instead of authenticating twice.
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const pack = CREDIT_PACKS.find((p) => p.id === body.packId)
  if (!pack) {
    return NextResponse.json({ error: 'Unknown credit pack' }, { status: 400 })
  }

  // Not req.nextUrl.origin: that reflects the request's Host header, which a
  // caller can set to anything. NEXTAUTH_URL is the app's actual configured
  // origin, so the redirect target can't be shaped by the request.
  const origin = process.env.NEXTAUTH_URL

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Identifies the buyer to the webhook without needing a stored Stripe
      // customer id — metadata carries the same values as a belt-and-braces
      // copy in case client_reference_id is ever dropped from a future event shape.
      client_reference_id: userId,
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            // Math.round: priceUsd is meant to be a whole-dollar amount today,
            // but plain float multiplication (e.g. 9.99 * 100) can land on
            // 998.9999999999999, which Stripe rejects as a non-integer amount.
            unit_amount: Math.round(pack.priceUsd * 100),
            product_data: { name: `${pack.credits} SubRadar credits` },
          },
        },
      ],
      metadata: { userId, packId: pack.id, credits: String(pack.credits) },
      success_url: `${origin}/settings/account?checkout=success`,
      cancel_url: `${origin}/settings/account?checkout=cancelled`,
    })

    if (!checkoutSession.url) throw new Error('missing_checkout_url')
    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('[billing checkout POST] Failed to create checkout session:', err)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 })
  }
}
