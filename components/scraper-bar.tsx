'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import Link from 'next/link'
import type { ScrapeStatus } from '@/lib/types'
import { showInsufficientCreditsToast } from '@/lib/insufficient-credits-toast'

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

// How long "Starting…" is allowed to cover for a trigger that hasn't shown up as a
// running job yet. `start()` in the trigger route dispatches the workflow and
// returns — it does NOT wait for the workflow's first step (markRunStartedStep,
// which is what actually inserts the scrape_jobs row `running` is read from) to
// execute, so there's a real gap between "the click was accepted" and "a poll can
// see it's running" with no fixed bound on it. This caps how long the UI keeps
// pretending on the user's behalf before giving up and going back to idle, rather
// than leaving the button disabled forever if the dispatch silently never starts.
const STARTING_GRACE_MS = 20_000

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
  // Same reason: lets the loop poll fast while `starting` is true even before a
  // poll has confirmed `running`, without re-subscribing the effect to `starting`.
  const startingRef = useRef(false)
  startingRef.current = starting
  const startingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Snapshot of last_finished_at at the moment a scan is triggered, so the
  // effect below can tell "a scan finished since I clicked" apart from "a scan
  // that finished before I clicked is still sitting in status". Doesn't need
  // its own effect to reset — it's only ever read while `starting` is true,
  // and handleRun always rewrites it before setting `starting` true again.
  const startingBaselineFinishedAtRef = useRef<string | null>(null)
  // Guards every state update/side effect that happens after an `await` in
  // fetchStatus — sequenced writes are fine (see the synchronous ref
  // read-then-write below), but nothing should touch state once the component
  // that owns it is gone.
  const mountedRef = useRef(true)

  function clearStartingTimeout() {
    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current)
      startingTimeoutRef.current = null
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStartingTimeout()
    }
  }, [])

  // The authoritative way `starting` turns off: a poll reports something that
  // could only be true once the workflow has actually started — it's running,
  // a *new* last_finished_at shows up (the whole cycle came and went between
  // two polls), an error landed, or the campaign got paused. Checking only
  // `running` would leave the bar stuck on "Starting scan…" for the rest of
  // STARTING_GRACE_MS if a scan finished (or failed) faster than the next
  // poll could catch it mid-flight — a real gap, not just a hypothetical one,
  // since a cycle with few pairs can finish in a few seconds. See
  // STARTING_GRACE_MS above for the fallback if none of this ever fires.
  useEffect(() => {
    if (!starting || !status) return
    const finishedSinceClick =
      status.last_finished_at != null &&
      status.last_finished_at !== startingBaselineFinishedAtRef.current
    if (status.running || finishedSinceClick || status.last_error || status.paused_reason) {
      clearStartingTimeout()
      setStarting(false)
    }
  }, [starting, status])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape-status')
      if (!res.ok) return
      const data: ScrapeStatus = await res.json()
      if (!mountedRef.current) return

      // Read-then-write with no `await` in between, so two fetchStatus calls
      // racing each other (the poll loop restarting mid-flight right after
      // handleRun's own trigger, or a slow response overlapping the next
      // scheduled tick) can't both see the same stale `previous` value and
      // both fire the finished side effects for what is actually one event.
      const previous = lastFinishedRef.current
      lastFinishedRef.current = data.last_finished_at

      // A newly-closed job means fresh rows landed — tell the feed to reload and
      // let the user know even if they've since switched tabs or scrolled away
      // from the bar (it already says so once they look back, but a scan can
      // take minutes and a tab isn't always in view the whole time).
      if (data.last_finished_at && previous && data.last_finished_at !== previous) {
        window.dispatchEvent(new CustomEvent(SCRAPE_FINISHED_EVENT))
        toast.success(
          data.last_posts_found === 0
            ? 'Scan finished — nothing new'
            : `Scan finished — ${data.last_posts_found} new ${
                data.last_posts_found === 1 ? 'post' : 'posts'
              }`
        )
      }

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
      const fast = statusRef.current?.running || startingRef.current
      timer = setTimeout(tick, fast ? POLL_RUNNING_MS : POLL_IDLE_MS)
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
    // Set before the request even goes out — the click itself is the moment
    // that needs to read as "acknowledged", not whatever poll eventually
    // catches the job. Cleared by the effect above once a poll actually
    // confirms `running`, or by the grace-period timeout below if none ever
    // does — never optimistically here, since the trigger route's own POST
    // resolving is not proof the workflow has started (see STARTING_GRACE_MS).
    startingBaselineFinishedAtRef.current = statusRef.current?.last_finished_at ?? null
    setStarting(true)
    clearStartingTimeout()
    startingTimeoutRef.current = setTimeout(() => setStarting(false), STARTING_GRACE_MS)
    try {
      const res = await fetch('/api/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 429) {
        toast.error(data.error || 'A scan is already running.')
        clearStartingTimeout()
        setStarting(false)
        return
      }
      if (res.status === 402) {
        if (typeof data.need === 'number' && typeof data.have === 'number') {
          showInsufficientCreditsToast(data.need, data.have)
        } else {
          toast.error(data.error || 'Not enough credits to run this scan.')
        }
        clearStartingTimeout()
        setStarting(false)
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Could not start the scan')
        clearStartingTimeout()
        setStarting(false)
        return
      }
      // Restart the poll loop at its fast cadence right away — tick() below
      // already stays fast while `starting` is true, so this just cancels the
      // idle timer that might otherwise still have most of a minute left on it.
      setPollNonce((n) => n + 1)
    } catch {
      toast.error('Could not start the scan')
      clearStartingTimeout()
      setStarting(false)
    }
  }

  const running = status?.running ?? false
  const pairsTotal = status?.pairs_total ?? 0
  const pairsDone = Math.min(status?.pairs_done ?? 0, pairsTotal)
  const fraction = pairsTotal > 0 ? pairsDone / pairsTotal : 0
  // The click-to-confirmed-running gap, in UI terms — the dot, message, and
  // button all read as "in progress" from the moment the button is pressed,
  // not just from the moment a status poll agrees `running` is true. `starting`
  // collapses back into `running` as soon as a poll confirms it (see the effect
  // above), or after STARTING_GRACE_MS if none ever does — a bridge across the
  // gap, not a second source of truth.
  const displayRunning = running || starting

  const justFinished =
    !running &&
    status?.last_finished_at != null &&
    Date.now() - new Date(status.last_finished_at).getTime() < RESULT_HOLD_MS

  return (
    <div className="border-b border-brand-surface-border bg-brand-surface">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-2.5 min-h-11">
          {/* Sonner's own toasts already announce to a screen reader, but only for the
              two moments that get a toast (finished, error) — a "Starting scan…"
              acknowledgment on click otherwise reaches sighted users only. This is
              the only announcement path for every other status change. */}
          <div className="min-w-0 flex items-center gap-2.5 text-sm" role="status" aria-live="polite">
            <StatusDot
              running={displayRunning}
              stalled={status?.stalled ?? false}
              error={!!status?.last_error}
              paused={!!status?.paused_reason}
            />
            <Message
              status={status}
              running={running}
              starting={starting}
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
            {/* Lives in the shrink-0 cluster, not inside Message's `truncate` span
                (which clips it on narrow viewports) or its `key={kind}` remount (which
                would drop keyboard focus and re-announce the aria-live region on every
                unrelated status poll). Only unmounts when paused_reason itself changes. */}
            {status?.paused_reason === 'insufficient_credits' && (
              <Link
                href="/settings/account#buy-credits"
                className="text-xs font-medium text-brand-accent underline underline-offset-2 hover:text-brand-accent-strong"
              >
                Buy credits
              </Link>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handleRun}
              disabled={starting || running}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${displayRunning ? 'animate-spin-slow' : ''}`} />
              {running ? 'Scanning' : starting ? 'Starting…' : 'Run scan'}
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
  paused,
}: {
  running: boolean
  stalled: boolean
  error: boolean
  paused: boolean
}) {
  if (stalled || error || paused) {
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
  starting,
  justFinished,
  pairsDone,
  pairsTotal,
}: {
  status: ScrapeStatus | null
  running: boolean
  starting: boolean
  justFinished: boolean
  pairsDone: number
  pairsTotal: number
}) {
  if (!status) {
    return <span className="text-brand-text-muted">Checking scanner…</span>
  }

  // The pill's own `key` below is the message's *kind*, not its exact text —
  // pairsDone ticking up every 2.5s while running is expected churn, not a new
  // message, and re-fading on every tick would turn the crossfade into a
  // distracting flicker. Only an actual change of kind (idle → running →
  // finished, an error appearing) remounts the span and replays the fade.
  let kind: string
  let content: React.ReactNode

  if (starting && !running) {
    // Covers the round trip between the click and the confirming fetchStatus
    // in handleRun — pairsTotal isn't known yet, so this can't just be the
    // "running" message with a 0/0 tacked on.
    kind = 'starting'
    content = <span className="font-medium text-brand-text-strong">Starting scan…</span>
  } else if (running) {
    // No pair-level narration ("r/X for 'Y'") — that's internals, not something a
    // user needs to watch happen. One calm line, same for every breakpoint.
    kind = 'running'
    content = (
      <>
        <span className="font-medium text-brand-text-strong">Scanning…</span>
        <span className="text-brand-text-muted tabular-nums"> {pairsDone}/{pairsTotal}</span>
      </>
    )
  } else if (status.paused_reason === 'insufficient_credits') {
    // The "Buy credits" CTA itself lives in the button cluster, not here — see
    // the comment beside it in ScraperBar. This span still carries `truncate`,
    // so an interactive control (and its focus) can't be clipped away.
    kind = 'paused'
    content = (
      <span className="text-brand-text">Scanning paused — out of credits. Buy credits to resume.</span>
    )
  } else if (status.stalled) {
    kind = 'stalled'
    content = (
      <span className="text-brand-text">
        The last scan stopped before it finished. Run it again to pick up where it left off.
      </span>
    )
  } else if (status.last_error) {
    kind = 'error'
    content = (
      <span className="text-brand-text">
        Last scan failed: <span className="text-brand-text-muted">{status.last_error}</span>
      </span>
    )
  } else if (justFinished) {
    kind = 'finished'
    content = (
      <span className="font-medium text-brand-text-strong">
        {status.last_posts_found === 0
          ? 'Scan finished, nothing new'
          : `Scan finished · ${status.last_posts_found} new ${
              status.last_posts_found === 1 ? 'post' : 'posts'
            }`}
      </span>
    )
  } else {
    kind = 'idle'
    const partial = pairsTotal > 0 && pairsDone > 0 && pairsDone < pairsTotal
    content = (
      <span className="text-brand-text-muted">
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
            · next scan {formatDistanceToNow(new Date(status.next_scrape_at), { addSuffix: true })}
          </span>
        )}
      </span>
    )
  }

  return (
    <span key={kind} className="truncate animate-fade-in">
      {content}
    </span>
  )
}
