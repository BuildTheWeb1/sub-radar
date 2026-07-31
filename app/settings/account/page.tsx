'use client'

import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'

export default function AccountPage() {
  const { data: session } = useSession()

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
