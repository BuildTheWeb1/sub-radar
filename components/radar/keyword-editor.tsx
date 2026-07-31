'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Plus, AlertCircle } from 'lucide-react'

const MAX_KEYWORDS = 20

// A keyword is used twice: as the `q=` of a Reddit search, and as a literal
// substring match against a post's title and body when scoring relevance
// (scoreRelevance in lib/scraper.ts). A sentence satisfies neither — it
// over-constrains the search and never matches verbatim, so every post scores
// zero. The UI has to teach that, because nothing downstream can recover from it.
const MAX_WORDS = 5

interface KeywordEditorProps {
  keywords: string[]
  onChange: (keywords: string[]) => void
  /** Keywords the model proposed that aren't in the list yet. */
  suggestions?: string[]
}

export function KeywordEditor({ keywords, onChange, suggestions = [] }: KeywordEditorProps) {
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState<string | null>(null)

  const unusedSuggestions = suggestions.filter(
    (s) => !keywords.some((k) => k.toLowerCase() === s.toLowerCase())
  )

  function add(raw: string) {
    const value = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!value) return

    if (keywords.some((k) => k.toLowerCase() === value)) {
      setRejected(`“${value}” is already on the list`)
      return
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setRejected(`You can track up to ${MAX_KEYWORDS} keywords`)
      return
    }
    if (value.split(' ').length > MAX_WORDS) {
      setRejected(
        'Too long to match — a post has to contain the phrase word for word. Try the two or three words at its core.'
      )
      return
    }

    onChange([...keywords, value])
    setDraft('')
    setRejected(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-brand-text-strong">Keywords</h2>
        <span className="text-xs tabular-nums text-brand-text-muted">
          {keywords.length}/{MAX_KEYWORDS}
        </span>
      </div>
      <p className="text-sm text-brand-text-muted max-w-prose">
        Short phrases people actually type in a post — “churn rate”, not “how do I reduce my
        churn rate”. A post scores higher the more of these it contains word for word.
      </p>

      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <li
              key={kw}
              className="chip-enter inline-flex items-center gap-1.5 rounded-full border border-brand-surface-border bg-white px-3 py-1 text-xs font-medium"
            >
              {kw}
              <button
                onClick={() => onChange(keywords.filter((k) => k !== kw))}
                aria-label={`Remove keyword ${kw}`}
                className="text-brand-text-muted transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-brand-text-muted">
          No keywords yet. Without at least one, nothing gets searched.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setRejected(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add(draft)
              }
            }}
            placeholder="e.g. churn rate"
            aria-label="Add a keyword"
            aria-invalid={rejected ? true : undefined}
            className="flex-1 min-w-0 rounded-md border border-brand-surface-border bg-white px-3 py-2 text-sm transition-[box-shadow,border-color] focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => add(draft)}
            disabled={!draft.trim() || keywords.length >= MAX_KEYWORDS}
            aria-label="Add keyword"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="slide-message" data-open={Boolean(rejected)}>
          <div>
            <p className="flex items-start gap-1.5 pt-0.5 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {rejected}
            </p>
          </div>
        </div>
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-brand-text-muted">Suggested</p>
          <ul className="flex flex-wrap gap-2">
            {unusedSuggestions.map((kw) => (
              <li key={kw}>
                <button
                  onClick={() => add(kw)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-surface-border px-3 py-1 text-xs text-brand-text-muted transition-colors hover:border-brand-surface-border-hover hover:text-brand-text"
                >
                  <Plus className="h-3 w-3" />
                  {kw}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
