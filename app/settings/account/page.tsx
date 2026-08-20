'use client'

import { useCallback, useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { Skeleton } from '@/components/ui/skeleton'
import { Coins, Target } from 'lucide-react'
import { BuyCredits } from '@/components/account/buy-credits'
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'

export default function AccountPage() {
  const { data: session } = useSession()

  const [balance, setBalance] = useState<number | null>(null)
  const [balanceError, setBalanceError] = useState(false)
  const [leadsThisMonth, setLeadsThisMonth] = useState<number | null>(null)
  const [usageError, setUsageError] = useState(false)

  // Returns the fetched balance so callers that need to compare against it
  // (the checkout-redirect poll below) don't have to read back the `balance`
  // state, which wouldn't be updated yet in the same tick.
  const loadBalance = useCallback(async (): Promise<number | null> => {
    setBalanceError(false)
    try {
      const r = await fetch('/api/credits')
      if (!r.ok) throw new Error('load_failed')
      const data: { balance: number } = await r.json()
      setBalance(data.balance)
      return data.balance
    } catch {
      setBalanceError(true)
      return null
    }
  }, [])

  useEffect(() => {
    loadBalance()
    fetch('/api/account/usage')
      .then((r) => {
        if (!r.ok) throw new Error('load_failed')
        return r.json()
      })
      .then((data: { leadsThisMonth: number }) => setLeadsThisMonth(data.leadsThisMonth))
      .catch(() => setUsageError(true))
  }, [loadBalance])

  // Stripe redirects back here with ?checkout=success|cancelled after Checkout.
  // Read window.location directly rather than useSearchParams — this page is
  // already fully client-rendered, and useSearchParams would otherwise force
  // a Suspense boundary just for this one-time redirect check. Strip the
  // param once handled so a refresh doesn't re-show the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    if (!checkout) return
    window.history.replaceState(null, '', window.location.pathname)

    if (checkout === 'cancelled') {
      toast('Checkout cancelled — no charge was made')
      return
    }
    if (checkout !== 'success') return

    // The browser lands here the instant Checkout completes, but crediting
    // happens later, out-of-band, when Stripe's webhook arrives — so the
    // balance fetched right now is frequently still the pre-purchase one.
    // Poll for a real change instead of showing "added" against a number
    // that hasn't moved yet.
    let cancelled = false
    ;(async () => {
      const toastId = toast.loading('Payment received — waiting for credits to post…')
      const baseline = await loadBalance()
      if (baseline === null) {
        toast('Payment received. Refresh in a moment to see your new balance.', { id: toastId })
        return
      }
      const deadline = Date.now() + 10_000
      while (!cancelled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const next = await loadBalance()
        if (cancelled) return
        if (next !== null && next !== baseline) {
          toast.success('Credits added to your balance', { id: toastId })
          return
        }
      }
      if (!cancelled) {
        toast('Payment received — credits should appear shortly. Refresh if they don\'t.', {
          id: toastId,
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // Only ever meaningful on first mount, when Stripe's redirect query
    // string is still present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <BrandMark size="md" />
        <div>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-brand-text-muted">Manage your account</p>
        </div>
      </div>

      <div className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-6">
        <section className="space-y-1.5">
          <h2 className="text-sm font-medium text-brand-text">Signed in as</h2>
          <p className="text-sm text-brand-text-muted">{session?.user?.email ?? '—'}</p>
        </section>

        <section className="space-y-1.5">
          <h2 className="text-sm font-medium text-brand-text">Leads this month</h2>
          {usageError ? (
            <p className="text-sm text-brand-text-muted">Could not load your usage.</p>
          ) : leadsThisMonth === null ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-brand-text-strong">
              <Target className="h-4 w-4 text-brand-accent" />
              {leadsThisMonth}
            </p>
          )}
          <p className="text-xs text-brand-text-muted max-w-prose">
            Reddit posts your radar has found so far this calendar month, across every campaign.
          </p>
        </section>

        <section id="buy-credits" className="space-y-1.5 scroll-mt-6">
          <h2 className="text-sm font-medium text-brand-text">Credits</h2>
          {balanceError ? (
            <p className="text-sm text-brand-text-muted">Could not load your balance.</p>
          ) : balance === null ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-brand-text-strong">
              <Coins className="h-4 w-4 text-brand-accent" />
              {balance}
            </p>
          )}
          <p className="text-xs text-brand-text-muted max-w-prose">
            Spent on scans (subreddits × keywords per cycle), subreddit/keyword
            suggestions, and content ideas. You&apos;ll see a message here or
            wherever you&apos;re working if an action needs more than you have.
          </p>
          <div className="pt-1">
            <BuyCredits />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-brand-text">Session</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </Button>
        </section>

        <section className="space-y-2 border-t border-brand-surface-border pt-6">
          <h2 className="text-sm font-medium text-brand-text">Danger zone</h2>
          <p className="text-xs text-brand-text-muted max-w-prose">
            Permanently delete your account and everything in it — campaigns, leads, and credit
            history.
          </p>
          <DeleteAccountDialog />
        </section>
      </div>
    </div>
  )
}
