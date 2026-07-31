'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BanRiskBadge } from '@/components/ban-risk-badge'
import { Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { SubredditCheck } from '@/lib/types'
import { formatMembers } from './format'

export interface SubredditSuggestion {
  name: string
  reason: string
}

interface SubredditSuggesterProps {
  productDescription: string
  /** Already watched — filtered out of results so we never suggest a duplicate. */
  existing: string[]
  /** Fired with the names the user picked. */
  onAdd: (names: string[]) => void
  /** How many more the caller can accept, so the UI can stop the user early. */
  remainingSlots: number
  /** Also hand back keywords, which the same model call produces. */
  onKeywords?: (keywords: string[]) => void
}

export function SubredditSuggester({
  productDescription,
  existing,
  onAdd,
  remainingSlots,
  onKeywords,
}: SubredditSuggesterProps) {
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState<SubredditSuggestion[] | null>(null)
  const [checks, setChecks] = useState<Record<string, SubredditCheck>>({})
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const describedEnough = productDescription.trim().length >= 20

  const verify = useCallback(async (names: string[]) => {
    if (names.length === 0) return
    setChecking(true)
    try {
      const res = await fetch('/api/subreddits/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      if (!res.ok) return
      const results: SubredditCheck[] = await res.json()

      const map: Record<string, SubredditCheck> = {}
      for (const c of results) map[c.name.toLowerCase()] = c
      setChecks(map)

      // A suggestion that turned out not to exist must not stay selected — saving
      // it would produce a target that silently returns nothing for ever.
      setSelected((prev) => {
        const next = new Set(prev)
        for (const c of results) {
          if (c.exists === false) next.delete(c.name.toLowerCase())
        }
        return next
      })
    } catch {
      // Leave rows in their unverified state; they stay selectable.
    } finally {
      setChecking(false)
    }
  }, [])

  async function handleSuggest() {
    if (!describedEnough) return
    setSuggesting(true)
    setError(null)
    setChecks({})
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDescription }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface what actually came back. A blanket "could not generate" gives
        // the user nothing to act on and hides whether the problem is their
        // input, their session, or the server.
        if (res.status === 401) throw new Error('Your session expired. Reload the page and sign in again.')
        if (res.status === 400 && data.error) throw new Error(data.error)
        throw new Error(
          data.error === 'suggestion_failed'
            ? 'The suggestion service did not respond. Try again in a moment.'
            : `Suggestions failed (${res.status}). Try again in a moment.`
        )
      }

      const excluded = new Set(existing.map((s) => s.toLowerCase()))
      const fresh: SubredditSuggestion[] = (data.subreddits ?? []).filter(
        (s: SubredditSuggestion) => !excluded.has(s.name.toLowerCase())
      )

      setSuggestions(fresh)
      setSelected(new Set(fresh.slice(0, remainingSlots).map((s) => s.name.toLowerCase())))
      onKeywords?.(data.keywords ?? [])

      if (fresh.length === 0) {
        setError('Every suggestion is already on your list. Try describing your product differently.')
        return
      }
      // Confirm each one exists before the user commits to it.
      verify(fresh.map((s) => s.name))
    } catch (err) {
      setError(`${(err as Error).message} You can still add subreddits by name below.`)
    } finally {
      setSuggesting(false)
    }
  }

  function toggle(name: string) {
    const key = name.toLowerCase()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        if (next.size >= remainingSlots) {
          toast.error(`You have room for ${remainingSlots} more`)
          return prev
        }
        next.add(key)
      }
      return next
    })
  }

  function handleAdd() {
    const names = (suggestions ?? [])
      .filter((s) => selected.has(s.name.toLowerCase()))
      .map((s) => s.name)
    if (names.length === 0) return
    onAdd(names)
    setSuggestions(null)
    setSelected(new Set())
    setChecks({})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSuggest} disabled={!describedEnough || suggesting}>
          {suggesting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding communities…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {suggestions ? 'Suggest more' : 'Suggest subreddits'}
            </>
          )}
        </Button>
        {!describedEnough && (
          <p className="text-sm text-brand-text-muted">
            Describe your product first so suggestions have something to go on.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-brand-surface-border bg-brand-surface px-3 py-2.5 text-sm text-brand-text">
          {error}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-3 animate-fade-up">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-brand-text-muted">
              {checking ? 'Checking these exist on Reddit…' : 'Pick the ones that fit.'}
            </p>
            <span className="text-xs tabular-nums text-brand-text-muted">
              {selected.size} selected
            </span>
          </div>

          <ul className="space-y-2">
            {suggestions.map((s) => {
              const check = checks[s.name.toLowerCase()]
              const missing = check?.exists === false
              const isSelected = selected.has(s.name.toLowerCase())
              const members = formatMembers(check?.subscribers ?? null)

              return (
                <li key={s.name}>
                  <label
                    className={`flex items-start gap-3 rounded-md border px-3 py-3 transition-colors ${
                      missing
                        ? 'border-brand-surface-border bg-brand-surface/60 cursor-not-allowed'
                        : 'border-brand-surface-border cursor-pointer hover:border-brand-surface-border-hover hover:bg-brand-surface'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={missing}
                      onChange={() => toggle(s.name)}
                      className="mt-1 accent-brand"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span
                          className={`text-sm font-medium ${
                            missing ? 'text-brand-text-muted line-through' : 'text-brand-text-strong'
                          }`}
                        >
                          r/{s.name}
                        </span>
                        {members && (
                          <span className="text-xs tabular-nums text-brand-text-muted">{members}</span>
                        )}
                        {check?.risk && check.risk !== 'unknown' && <BanRiskBadge risk={check.risk} />}
                        {!check && checking && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-text-muted" aria-label="Checking" />
                        )}
                      </div>
                      <p className="text-sm text-brand-text-muted">
                        {missing ? (
                          <span className="inline-flex items-center gap-1.5 text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {check.error ?? 'No such subreddit'} — skipped
                          </span>
                        ) : (
                          s.reason
                        )}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>

          <Button onClick={handleAdd} disabled={selected.size === 0}>
            <Check className="h-4 w-4" />
            Add {selected.size > 0 ? selected.size : ''}{' '}
            {selected.size === 1 ? 'subreddit' : 'subreddits'}
          </Button>
        </div>
      )}
    </div>
  )
}
