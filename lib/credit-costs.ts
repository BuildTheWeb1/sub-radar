// Pure constants, deliberately split out from lib/credits.ts: that module
// imports lib/db (which is `server-only`), so a client component importing
// anything from it — even just a number — fails to bundle. This file has no
// server dependencies, so both the routes that charge these costs and the
// client components that display them beforehand can import the same values.
export const SUGGEST_COST = 1
export const CONTENT_IDEAS_COST = 3
// Single-post idea generation is scoped to one post's context, not a 20-post
// batch, so it costs less than the bulk Content Ideas run above.
export const POST_CONTENT_IDEA_COST = 1

export interface CreditPack {
  id: string
  credits: number
  priceUsd: number
}

// Flat price_data line items at checkout time, not pre-created Stripe Price
// objects — keeps a pack addable here without any matching setup in the
// Stripe dashboard. `id` doubles as the client_reference for the checkout
// route and the value the webhook trusts to know how many credits to grant.
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter', credits: 200, priceUsd: 5 },
  { id: 'growth', credits: 1000, priceUsd: 20 },
  { id: 'scale', credits: 3000, priceUsd: 50 },
]
