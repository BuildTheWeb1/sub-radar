'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock, Zap } from 'lucide-react'
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'

interface LastJob {
  started_at: string
  finished_at: string | null
  posts_found: number
  error_message: string | null
}

interface Status {
  last_run: string | null
  next_run: string | null
  new_posts: number
  last_job: LastJob | null
}

export function ScrapeStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [triggering, setTriggering] = useState(false)
  const triggerTimeRef = useRef<number | null>(null)
  const fastPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchStatus(): Promise<Status | null> {
    try {
      const res = await fetch('/api/scrape-status')
      const data = await res.json()
      setStatus(data)
      return data as Status
    } catch {
      return null
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => {
      clearInterval(interval)
      if (fastPollRef.current) clearInterval(fastPollRef.current)
    }
  }, [])

  function startFastPoll() {
    if (fastPollRef.current) clearInterval(fastPollRef.current)
    fastPollRef.current = setInterval(async () => {
      const data = await fetchStatus()
      if (!data) return
      const finished = data.last_job?.finished_at
      if (
        finished &&
        triggerTimeRef.current &&
        new Date(finished).getTime() > triggerTimeRef.current
      ) {
        clearInterval(fastPollRef.current!)
        fastPollRef.current = null
        setTriggering(false)
        if (data.last_job?.error_message) {
          toast.error(`Scrape failed: ${data.last_job.error_message}`)
        } else {
          toast.success(`Scrape complete — ${data.last_job?.posts_found ?? 0} new posts found`)
        }
      }
    }, 3000)
  }

  async function handleTrigger() {
    setTriggering(true)
    triggerTimeRef.current = Date.now()
    try {
      const res = await fetch('/api/scrape/trigger', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Scrape failed')
        setTriggering(false)
        return
      }
      toast.info('Scanning subreddits…')
      startFastPoll()
    } catch {
      toast.error('Scrape failed')
      setTriggering(false)
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-all duration-300 ${
        triggering
          ? 'border-orange-300 bg-[#fffbf5] shadow-[0_0_0_3px_rgba(251,146,60,0.12)]'
          : 'border-[#fde8cc] bg-[#fffbf5]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Scraper</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-[#fde8cc] text-[#c2410c] hover:bg-[#fff7ed]"
          onClick={handleTrigger}
          disabled={triggering}
        >
          <RefreshCw className={`h-3 w-3 ${triggering ? 'animate-spin' : ''}`} />
          {triggering ? 'Running…' : 'Run now'}
        </Button>
      </div>

      {triggering && (
        <div className="flex items-center gap-2 text-xs text-[#c2410c] bg-[#fff7ed] rounded-md px-2.5 py-1.5">
          <span className="flex gap-0.5 items-center">
            <span className="w-1.5 h-1.5 bg-[#c2410c] rounded-full animate-bounce [animation-delay:-300ms]" />
            <span className="w-1.5 h-1.5 bg-[#c2410c] rounded-full animate-bounce [animation-delay:-150ms]" />
            <span className="w-1.5 h-1.5 bg-[#c2410c] rounded-full animate-bounce" />
          </span>
          <span>Scanning subreddits…</span>
        </div>
      )}

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
          <span className="bg-[#fde8cc] text-[#c2410c] font-bold text-xs px-2 py-0.5 rounded-full">
            {status?.new_posts ?? 0}
          </span>
          <span>unreviewed posts</span>
        </div>
      </div>
    </div>
  )
}
