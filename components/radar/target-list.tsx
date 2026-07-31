'use client'

import { useState } from 'react'
import { BanRiskBadge } from '@/components/ban-risk-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { X, ChevronRight } from 'lucide-react'
import type { SubredditGuideline } from '@/lib/types'
import { formatMembers } from './format'

const SELF_PROMO_LABELS: Record<SubredditGuideline['self_promo_policy'], string> = {
  allowed: 'Self-promo allowed',
  limited: 'Self-promo limited',
  banned: 'Self-promo banned',
  unknown: 'Self-promo policy unknown',
}

interface TargetListProps {
  subreddits: string[]
  guidelines: Record<string, SubredditGuideline>
  postCounts: Record<string, number>
  onRemove: (name: string) => void
  loading: boolean
  /** False until the first scan completes, so "0 posts" isn't read as failure. */
  hasScraped: boolean
}

export function TargetList({
  subreddits,
  guidelines,
  postCounts,
  onRemove,
  loading,
  hasScraped,
}: TargetListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (subreddits.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-brand-surface-border px-4 py-5 text-sm text-brand-text-muted">
        You aren&apos;t watching any subreddits yet. Use the suggestions above, or add one by name.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {subreddits.map((sub) => {
        const g = guidelines[sub.toLowerCase()]
        const count = postCounts[sub.toLowerCase()] ?? 0
        const isOpen = expanded.has(sub)
        const members = formatMembers(g?.subscribers ?? null)

        return (
          <li
            key={sub}
            className="rounded-md border border-brand-surface-border px-3 py-3 transition-colors hover:border-brand-surface-border-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <a
                    href={`https://reddit.com/r/${sub}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-text-strong hover:underline"
                  >
                    r/{sub}
                  </a>
                  {members && (
                    <span className="text-xs tabular-nums text-brand-text-muted">{members}</span>
                  )}
                  {g && <BanRiskBadge risk={g.risk} />}
                </div>

                <p className="text-xs text-brand-text-muted">
                  <span className="tabular-nums">
                    {count === 0 && !hasScraped
                      ? 'Not scanned yet'
                      : `${count} ${count === 1 ? 'post' : 'posts'} found`}
                  </span>
                  {g && <> · {SELF_PROMO_LABELS[g.self_promo_policy]}</>}
                  {g?.min_karma != null && <> · {g.min_karma}+ karma</>}
                  {g?.min_account_age_days != null && <> · {g.min_account_age_days}d account age</>}
                </p>

                {g?.cadence_note && (
                  <p className="text-xs text-brand-text-muted">{g.cadence_note}</p>
                )}

                {g && g.rules.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggle(sub)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
                    >
                      <ChevronRight
                        className={`h-3 w-3 transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                      />
                      {isOpen ? 'Hide' : 'Show'} rules ({g.rules.length})
                    </button>
                    <div className="disclosure-rows" data-open={isOpen}>
                      <div>
                        <ul className="mt-2 space-y-2 pl-1">
                          {g.rules.map((rule, i) => (
                            <li key={i} className="text-xs">
                              <span className="font-medium text-brand-text">{rule.title}</span>
                              {rule.description && (
                                <p className="text-brand-text-muted">{rule.description}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => onRemove(sub)}
                aria-label={`Stop watching r/${sub}`}
                className="shrink-0 rounded-md p-1 text-brand-text-muted transition-colors hover:bg-brand-surface hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
