'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock, Zap } from 'lucide-react'
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'

interface Status {
  last_run: string | null
  next_run: string | null
  new_posts: number
}

export function ScrapeStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [triggering, setTriggering] = useState(false)

  async function fetchStatus() {
    try {
      const res = await fetch('/api/scrape-status')
      const data = await res.json()
      setStatus(data)
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function handleTrigger() {
    setTriggering(true)
    try {
      const res = await fetch('/api/scrape/trigger', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Scrape failed')
      } else {
        toast.success(`Scrape complete — ${data.posts_found ?? 0} new posts`)
        fetchStatus()
      }
    } catch {
      toast.error('Scrape failed')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Scraper</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={handleTrigger}
          disabled={triggering}
        >
          <RefreshCw className={`h-3 w-3 ${triggering ? 'animate-spin' : ''}`} />
          {triggering ? 'Running…' : 'Run now'}
        </Button>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>
            Last run:{' '}
            {status?.last_run
              ? formatDistanceToNow(new Date(status.last_run), { addSuffix: true })
              : 'Never'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          <span>
            Next run:{' '}
            {status?.next_run
              ? `in ${formatDistanceToNowStrict(new Date(status.next_run))}`
              : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{status?.new_posts ?? 0}</span>
          <span>unreviewed posts</span>
        </div>
      </div>
    </div>
  )
}
