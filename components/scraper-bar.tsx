'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { STALLED_MARKER } from '@/lib/scrape-jobs'
import type { ScrapeStatus } from '@/lib/types'

// Poll hard while a scrape is genuinely open, and back off to a heartbeat when it
// is not. A scrape pair takes ~1.5s minimum (INTER_REQUEST_DELAY_MS), so polling
// faster than that would show the same pair twice.
const POLL_RUNNING_MS = 2_500
const POLL_IDLE_MS = 60_000

// Roughly how long the "+N new posts" result stays up before the bar settles back
// to idle. Evaluated at render, and nothing schedules a re-render at the boundary,
// so in practice it clears on the first poll after this elapses — up to POLL_IDLE_MS
// later. Close enough for a transient confirmation; not a guarantee.
const RESULT_HOLD_MS = 30_000

/** Broadcast so the post feed can refetch itself when a scrape lands. */
export const SCRAPE_FINISHED_EVENT = 'subradar:scrape-finished'

export function ScraperBar() {
  const [status, setStatus] = useState<ScrapeStatus | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // Bumped to tear down and immediately restart the polling loop. Without it, a
  // scan started by hand would inherit the 60s idle timer that was already
  // scheduled, and the bar would sit motionless for up to a minute while the
  // scrape was in fact running.
  const [pollNonce, setPollNonce] = useState(0)
  const lastFinishedRef = useRef<string | null>(null)

  // Lets the polling loop read the current status without listing it as a
  // dependency, which would tear down and restart the loop on every tick.
  const statusRef = useRef<ScrapeStatus | null>(null)
  statusRef.current = status

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape-status')
      if (!res.ok) return
      const data: ScrapeStatus = await res.json()

      // A newly-closed job means fresh rows landed — tell the feed to reload.
      if (
        data.last_finished_at &&
        lastFinishedRef.current &&
        data.last_finished_at !== lastFinishedRef.current
      ) {
        window.dispatchEvent(new CustomEvent(SCRAPE_FINISHED_EVENT))
      }
      lastFinishedRef.current = data.last_finished_at

      setStatus(data)
    } catch {
      // Keep the last known status on a transient failure rather than flashing empty.
    }
  }, [])

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCampaignId(data?.id ?? null))
      .catch(() => {
        // "Run now" surfaces its own error if this never resolves.
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      if (cancelled) return
      await fetchStatus()
      if (cancelled) return
      timer = setTimeout(tick, statusRef.current?.running ? POLL_RUNNING_MS : POLL_IDLE_MS)
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fetchStatus, pollNonce])

  async function handleRun() {
    if (!campaignId) {
      toast.error('Still loading your campaign — try again in a moment')
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        toast.error(data.error || 'A scan ran recently. Try again in a few minutes.')
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Could not start the scan')
        return
      }
      // The trigger route inserts the scrape_jobs row before dispatching the
      // background request, so the job is already visible — restart the loop at
      // its fast cadence rather than guessing at a delay.
      setPollNonce((n) => n + 1)
    } catch {
      toast.error('Could not start the scan')
    } finally {
      setStarting(false)
    }
  }

  const running = status?.running ?? false
  const pairsTotal = status?.pairs_total ?? 0
  const pairsDone = Math.min(status?.pairs_done ?? 0, pairsTotal)
  const fraction = pairsTotal > 0 ? pairsDone / pairsTotal : 0

  const justFinished =
    !running &&
    status?.last_finished_at != null &&
    Date.now() - new Date(status.last_finished_at).getTime() < RESULT_HOLD_MS

  return (
    <div className="border-b border-brand-surface-border bg-brand-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-2.5 min-h-11">
          <div className="min-w-0 flex items-center gap-2.5 text-sm">
            <StatusDot running={running} stalled={status?.stalled ?? false} error={!!status?.last_error} />
            <Message
              status={status}
              running={running}
              justFinished={justFinished}
              pairsDone={pairsDone}
              pairsTotal={pairsTotal}
            />
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {running && pairsTotal > 0 && (
              <span className="hidden sm:inline tabular-nums text-xs text-brand-text-muted">
                {pairsDone} of {pairsTotal}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handleRun}
              disabled={starting || running}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin-slow' : ''}`} />
              {running ? 'Scanning' : 'Run scan'}
            </Button>
          </div>
        </div>
      </div>

      {/* Determinate track. Scales on the X axis rather than animating width, and is
          mounted only while a scrape is genuinely open — a progress bar for a scraper
          that is not running would be decoration. */}
      <div
        className="h-0.5 w-full overflow-hidden bg-brand-surface-border/60 transition-opacity"
        style={{ opacity: running && pairsTotal > 0 ? 1 : 0 }}
        aria-hidden={!running}
      >
        {/* Linear, not eased: this is the one place the motion spec allows it.
            Work is completing at a roughly constant rate, and easing each step
            would imply the scan is slowing down as it approaches each pair. */}
        <div
          className="h-full origin-left bg-brand transition-transform duration-500 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${running ? Math.max(fraction, 0.02) : 0})` }}
          role="progressbar"
          aria-valuenow={pairsDone}
          aria-valuemin={0}
          aria-valuemax={pairsTotal || 1}
          aria-label="Scan progress"
        />
      </div>
    </div>
  )
}

function StatusDot({
  running,
  stalled,
  error,
}: {
  running: boolean
  stalled: boolean
  error: boolean
}) {
  if (stalled || error) {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
  }
  // Static when static. The dot only breathes while pairs are actually being
  // fetched, so its motion always means something is changing.
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        running ? 'bg-brand animate-breathe' : 'bg-brand-text-muted/40'
      }`}
      aria-hidden
    />
  )
}

function Message({
  status,
  running,
  justFinished,
  pairsDone,
  pairsTotal,
}: {
  status: ScrapeStatus | null
  running: boolean
  justFinished: boolean
  pairsDone: number
  pairsTotal: number
}) {
  if (!status) {
    return <span className="text-brand-text-muted">Checking scanner…</span>
  }

  if (running) {
    const target =
      status.current_subreddit && status.current_keyword ? (
        <>
          <span className="font-medium text-brand-text-strong">r/{status.current_subreddit}</span>
          <span className="text-brand-text-muted"> for “{status.current_keyword}”</span>
        </>
      ) : (
        <span className="text-brand-text-muted">starting up</span>
      )
    return (
      <span className="truncate">
        Searching {target}
        <span className="sm:hidden text-brand-text-muted tabular-nums">
          {' '}
          · {pairsDone}/{pairsTotal}
        </span>
      </span>
    )
  }

  if (status.stalled) {
    return (
      <span className="truncate text-brand-text">
        The last scan stopped before it finished. Run it again to pick up where it left off.
      </span>
    )
  }

  if (status.last_error && status.last_error !== STALLED_MARKER) {
    return (
      <span className="truncate text-brand-text">
        Last scan failed: <span className="text-brand-text-muted">{status.last_error}</span>
      </span>
    )
  }

  if (justFinished) {
    return (
      <span className="truncate">
        <span className="font-medium text-brand-text-strong">
          {status.last_posts_found === 0
            ? 'Scan finished, nothing new'
            : `Scan finished · ${status.last_posts_found} new ${
                status.last_posts_found === 1 ? 'post' : 'posts'
              }`}
        </span>
      </span>
    )
  }

  const partial = pairsTotal > 0 && pairsDone > 0 && pairsDone < pairsTotal

  return (
    <span className="truncate text-brand-text-muted">
      {status.last_scraped_at
        ? `Last scan ${formatDistanceToNow(new Date(status.last_scraped_at), { addSuffix: true })}`
        : 'No scan yet'}
      {partial && (
        <span className="tabular-nums">
          {' '}
          · paused at {pairsDone}/{pairsTotal}
        </span>
      )}
      {status.next_scrape_at && (
        <span className="hidden sm:inline">
          {' '}
          · next {formatDistanceToNow(new Date(status.next_scrape_at), { addSuffix: true })}
          <span className="hidden lg:inline"> · scheduled scans run {status.cadence}</span>
        </span>
      )}
    </span>
  )
}
