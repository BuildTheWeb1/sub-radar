'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CREDIT_PACKS } from '@/lib/credit-costs'

export function BuyCredits() {
  const [pending, setPending] = useState<string | null>(null)

  async function buy(packId: string) {
    setPending(packId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error()
      // Full-page redirect into Stripe Checkout — not a fetch destination, so
      // there is no response to await here; the browser navigates away.
      window.location.href = data.url
    } catch {
      toast.error('Could not start checkout. Try again in a moment.')
      setPending(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CREDIT_PACKS.map((pack) => (
        <Button
          key={pack.id}
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => buy(pack.id)}
        >
          {pending === pack.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pack.credits.toLocaleString()} credits — ${pack.priceUsd}
        </Button>
      ))}
    </div>
  )
}
