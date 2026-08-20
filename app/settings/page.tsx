'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Radar, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Campaign } from '@/lib/types'
import { CREDIT_PACKS } from '@/lib/credit-costs'
import { pluralize } from '@/lib/utils'

// Mirrors FREQUENCY_HOURS in lib/workflows/scrape-cycle.ts — duplicated rather
// than imported because that module pulls in workflow/server-only deps a
// client component can't bundle.
const FREQUENCY_HOURS: Record<string, number> = { '1h': 1, '2h': 2, '6h': 6, '12h': 12 }

// Worst-case (highest) $/credit — the starter pack — is used deliberately: a
// first-time buyer is most likely to be on this pack, so showing that rate is
// the conservative, not-misleadingly-low estimate.
const WORST_CASE_USD_PER_CREDIT = Math.max(...CREDIT_PACKS.map((p) => p.priceUsd / p.credits))

export default function SettingsPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [scrapeFrequency, setScrapeFrequency] = useState('2h')
  const [minRelevance, setMinRelevance] = useState(0)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('config_load_failed')
        return r.json()
      })
      .then((data: Campaign) => {
        setCampaign(data)
        setScrapeFrequency(data.scrape_frequency ?? '2h')
        setMinRelevance(data.min_relevance ?? 0)
      })
      .catch(() => setLoadError('Could not load your settings. Try refreshing the page.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!campaign) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the two fields this page owns. /api/config leaves anything absent
        // alone, so a stale snapshot here can no longer overwrite targeting that
        // was changed on Radar in the meantime.
        body: JSON.stringify({
          scrape_frequency: scrapeFrequency,
          min_relevance: minRelevance,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setCampaign(data as Campaign)
      toast.success('Settings saved')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 max-w-2xl">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-text-strong">Settings</h1>
        <p className="text-sm text-brand-text-muted">How often the scanner runs, and what it keeps.</p>
      </header>

      {loadError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {loadError}
        </p>
      )}

      <Link
        href="/dashboard/radar"
        className="flex items-center gap-3 rounded-md border border-brand-surface-border px-4 py-3.5 transition-colors hover:border-brand-surface-border-hover hover:bg-brand-surface"
      >
        <Radar className="h-5 w-5 shrink-0 text-brand-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-brand-text-strong">
            Subreddits and keywords moved to Radar
          </span>
          <span className="block text-sm text-brand-text-muted">
            {campaign?.subreddits.length ?? 0} subreddits · {campaign?.keywords.length ?? 0} keywords
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand-text-muted" />
      </Link>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-text-strong">Scan frequency</h2>
        <p className="text-sm text-brand-text-muted max-w-prose">
          How long the scanner waits after finishing a full pass before starting the next one.
        </p>
        <Select value={scrapeFrequency} onValueChange={(v) => v && setScrapeFrequency(v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Every hour</SelectItem>
            <SelectItem value="2h">Every 2 hours</SelectItem>
            <SelectItem value="6h">Every 6 hours</SelectItem>
            <SelectItem value="12h">Every 12 hours</SelectItem>
          </SelectContent>
        </Select>
        {campaign && (
          <p className="text-xs text-brand-text-muted tabular-nums">
            {(() => {
              const pairs = campaign.subreddits.length * campaign.keywords.length
              const hours = FREQUENCY_HOURS[scrapeFrequency] ?? 2
              const creditsPerDay = pairs * (24 / hours)
              const usdPerDay = creditsPerDay * WORST_CASE_USD_PER_CREDIT
              return pairs > 0
                ? `≈ ${creditsPerDay.toLocaleString()} credits/day (≈ $${usdPerDay.toFixed(2)}/day at starter pricing) at this cadence, given your ${campaign.subreddits.length} subreddits × ${campaign.keywords.length} keywords.`
                : 'Add subreddits and keywords on Radar to see the cost of this cadence.'
            })()}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-text-strong">Discard threshold</h2>
        <p className="text-sm text-brand-text-muted max-w-prose">
          Every time one of your keywords appears in a post, it scores 20 points, up to 100. Raise
          this slider to require more mentions before a post is kept — anything scoring below it
          is thrown away during the scan and never stored. That&apos;s permanent: this isn&apos;t a
          display filter, so raising it can&apos;t bring back posts already skipped. Keep this at 0
          unless your feed is genuinely too noisy — a filter you can undo (Min keyword match, on
          the feed itself) already narrows what you look at without losing anything.
        </p>
        <div className="space-y-2 max-w-sm">
          <div className="flex items-baseline justify-between">
            <label htmlFor="min-relevance" className="text-sm text-brand-text">
              Discard below
            </label>
            <span className="text-sm font-medium tabular-nums text-brand-text-strong">
              {minRelevance}
            </span>
          </div>
          <input
            id="min-relevance"
            type="range"
            min={0}
            max={100}
            step={5}
            value={minRelevance}
            onChange={(e) => setMinRelevance(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-xs text-brand-text-muted">
            <span>0 — keep everything</span>
            <span>100</span>
          </div>
          <p className="text-xs font-medium text-brand-accent">
            {minRelevance === 0
              ? 'Nothing is discarded — every scanned post is stored.'
              : `A post needs at least ${pluralize(Math.ceil(minRelevance / 20), 'keyword mention')} to be kept.`}
          </p>
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}
