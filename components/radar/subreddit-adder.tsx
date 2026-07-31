'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { SubredditCheck } from '@/lib/types'
import { formatMembers } from './format'

interface SubredditAdderProps {
  existing: string[]
  onAdd: (name: string) => void
  disabled?: boolean
}

/**
 * Manual subreddit entry that confirms the name resolves on Reddit before adding
 * it. Previously a typo was saved without complaint and then produced an empty
 * feed with no explanation, because nothing downstream checks existence.
 *
 * Verification failure and rejection are deliberately kept apart. Only a verdict
 * — "no such subreddit", "private or banned", "not a valid name" — blocks the
 * add. If we simply could not reach Reddit, that is our problem, not the user's:
 * they get the reason plus an "Add anyway", because otherwise an expired
 * REDDIT_COOKIE (which needs manual refreshing) silently locks everyone out of
 * editing their own targets.
 */
export function SubredditAdder({ existing, onAdd, disabled }: SubredditAdderProps) {
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const [unverified, setUnverified] = useState<string | null>(null)

  function clearFeedback() {
    setRejected(null)
    setUnverified(null)
  }

  function commit(name: string, note?: string) {
    onAdd(name)
    setDraft('')
    clearFeedback()
    if (note) toast.warning(note)
  }

  async function submit() {
    const name = draft.trim().replace(/^\/?r\//i, '')
    if (!name) return

    if (existing.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setRejected(`You're already watching r/${name}`)
      return
    }

    setChecking(true)
    clearFeedback()
    try {
      const res = await fetch('/api/subreddits/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [name] }),
      })

      if (!res.ok) {
        // The route itself failed (timeout, 500, auth). No verdict either way.
        setUnverified('Could not reach Reddit to check this one.')
        return
      }

      const [check]: SubredditCheck[] = await res.json()

      if (check?.exists === false) {
        setRejected(`${check.error ?? 'No such subreddit'} — check the spelling`)
        return
      }

      if (check?.exists === null) {
        setUnverified(check.error ?? 'Could not reach Reddit to check this one.')
        return
      }

      const members = formatMembers(check?.subscribers ?? null)
      onAdd(name)
      setDraft('')
      clearFeedback()
      toast.success(`Added r/${name}${members ? ` · ${members}` : ''}`)
    } catch {
      setUnverified('Could not reach Reddit to check this one.')
    } finally {
      setChecking(false)
    }
  }

  const pendingName = draft.trim().replace(/^\/?r\//i, '')

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            clearFeedback()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Add by name, e.g. SaaS"
          aria-label="Add a subreddit by name"
          aria-invalid={rejected ? true : undefined}
          disabled={disabled || checking}
          className="flex-1 min-w-0 rounded-md border border-brand-surface-border bg-white px-3 py-2 text-sm transition-[box-shadow,border-color] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={submit}
          disabled={disabled || checking || !draft.trim()}
          aria-label="Add subreddit"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      <div className="slide-message" data-open={Boolean(rejected || unverified)}>
        <div>
          {rejected && (
            <p className="flex items-start gap-1.5 pt-0.5 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {rejected}
            </p>
          )}
          {unverified && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-sm text-brand-text-muted">
              <span className="flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {unverified}
              </span>
              <button
                onClick={() => commit(pendingName, `Added r/${pendingName} without verifying it`)}
                className="font-medium text-brand-accent underline underline-offset-2 hover:text-brand-accent-strong"
              >
                Add r/{pendingName} anyway
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
