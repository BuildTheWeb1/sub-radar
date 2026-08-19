import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { addCredits } from '@/lib/credits'
import { CREDIT_PACKS } from '@/lib/credit-costs'

/**
 * Stripe calls this directly (never the browser), so it deliberately does not
 * go through requireUserId — authenticity comes from the signature check
 * below, not a session cookie. Reads the raw body via req.text() rather than
 * req.json(): Stripe's signature is computed over the exact request bytes,
 * and re-serializing a parsed object would not reproduce them.
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[billing webhook] STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  const payload = await req.text()

  let event: Stripe.Event
  try {
    if (!signature) throw new Error('missing_signature')
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[billing webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // checkout.session.completed fires as soon as the *session* completes,
  // which for delayed-notification payment methods (ACH debit, SEPA, OXXO,
  // etc — enabled automatically by Stripe's default "automatic payment
  // methods") happens before the money actually settles. Granting credits
  // there would pay out before the charge is guaranteed to succeed. Instead,
  // require payment_status: 'paid' — true immediately for cards, and true
  // once async_payment_succeeded later fires for delayed methods (Checkout
  // emits both events for the same session, so handling both covers instant
  // and delayed payment methods identically).
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const userId = session.client_reference_id ?? session.metadata?.userId
    // Re-derive the credit amount from the pack id rather than trusting
    // metadata.credits verbatim — keeps the grant tied to a value this route
    // itself controls (via CREDIT_PACKS) instead of whatever round-tripped
    // through Stripe, and doubles as a bound: no session can ever grant more
    // than the largest pack defined below.
    const pack = CREDIT_PACKS.find((p) => p.id === session.metadata?.packId)

    if (!userId || !pack) {
      console.error('[billing webhook] session missing usable metadata:', session.id)
      // Malformed metadata can never resolve on retry — ack so Stripe stops resending.
      return NextResponse.json({ received: true })
    }

    try {
      await addCredits(userId, pack.credits, session.id)
    } catch (err) {
      console.error('[billing webhook] Failed to credit purchase:', err)
      // Unlike bad metadata, this can be transient (e.g. a DB blip, or the
      // account being deleted between charge and webhook) — let Stripe retry
      // and alert on repeated failure, rather than silently dropping a paid
      // purchase.
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
