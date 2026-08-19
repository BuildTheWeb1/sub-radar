import 'server-only'
import Stripe from 'stripe'

// apiVersion is intentionally omitted — pins to whatever version the
// installed SDK release defaults to, instead of a literal string that would
// need to be bumped by hand on every stripe package upgrade.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
