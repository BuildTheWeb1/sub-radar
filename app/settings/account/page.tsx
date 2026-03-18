'use client'

import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function AccountPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your account</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Signed in as</h2>
        <p className="text-sm text-muted-foreground">{session?.user?.email ?? '—'}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Session</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          Sign out
        </Button>
      </section>
    </div>
  )
}
