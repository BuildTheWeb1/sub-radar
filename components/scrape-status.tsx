'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

interface Status {
  last_scraped_at: string | null
  next_scrape_at: string | null
  new_count: number
  week_count: number
  frequency: string
}

export function ScrapeStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape-status')
      if (!res.ok) return
      const data = await res.json()
      setStatus(data)
    } catch {
      // Keep showing the last known status on transient failures
    }
  }, [])

  const fetchCampaignId = useCallback(async () => {
    try {
      const res = await fetch('/api/config')
      if (!res.ok) return
      const data = await res.json()
      setCampaignId(data?.id ?? null)
    } catch {
      // "Run now" will just prompt the user to retry if this never resolves
    }
  }, [])

  useEffect(() => {
    // Defer the initial fetches to the next tick so we never call setState
    // synchronously during the effect that mounts this component.
    const initial = setTimeout(() => {
      fetchStatus()
      fetchCampaignId()
    }, 0)
    const interval = setInterval(fetchStatus, 60_000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [fetchStatus, fetchCampaignId])

  async function handleTrigger() {
    if (!campaignId) {
      toast.error('No campaign found yet — try again in a moment')
      return
    }
    setTriggering(true)
    try {
      const res = await fetch('/api/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        toast.error('Try again in a few minutes')
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Scrape failed to start')
        return
      }

      toast.success('Scrape started')
      // Give the background scrape a little time to land, then refresh counts.
      setTimeout(fetchStatus, 15_000)
    } catch {
      toast.error('Scrape failed to start')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Scraper</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-brand-surface-border text-brand-accent hover:bg-brand-foreground"
          onClick={handleTrigger}
          disabled={triggering}
        >
          <RefreshCw className={`h-3 w-3 ${triggering ? 'animate-spin' : ''}`} />
          {triggering ? 'Starting…' : 'Run now'}
        </Button>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>
            Last scrape:{' '}
            {status?.last_scraped_at
              ? formatDistanceToNow(new Date(status.last_scraped_at), { addSuffix: true })
              : 'Never'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          <span>
            Next scrape:{' '}
            {status?.next_scrape_at
              ? formatDistanceToNow(new Date(status.next_scrape_at), { addSuffix: true })
              : '—'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="bg-brand-surface-border text-brand-accent-strong font-bold text-xs px-2 py-0.5 rounded-full">
              {status?.new_count ?? 0}
            </span>
            <span>unreviewed</span>
          </span>
          <span>{status?.week_count ?? 0} this week</span>
        </div>
      </div>
    </div>
  )
}
