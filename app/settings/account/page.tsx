'use client'

import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { Skeleton } from '@/components/ui/skeleton'
import { Coins } from 'lucide-react'

export default function AccountPage() {
  const { data: session } = useSession()
  const [balance, setBalance] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch('/api/credits')
      .then((r) => {
        if (!r.ok) throw new Error('load_failed')
        return r.json()
      })
      .then((data: { balance: number }) => setBalance(data.balance))
      .catch(() => setLoadError(true))
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
          <h2 className="text-sm font-medium text-brand-text">Credits</h2>
          {loadError ? (
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
      </div>
    </div>
  )
}
