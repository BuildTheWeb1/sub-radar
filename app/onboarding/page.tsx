'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { toast } from 'sonner'
import { SubredditSuggester } from '@/components/radar/subreddit-suggester'
import { SubredditAdder } from '@/components/radar/subreddit-adder'
import { KeywordEditor } from '@/components/radar/keyword-editor'
import { X, ChevronDown } from 'lucide-react'

const MIN_DESCRIPTION_LENGTH = 20
const MAX_SUBREDDITS = 10

export default function OnboardingPage() {
  const router = useRouter()

  const [step, setStep] = useState<1 | 2>(1)
  const [productDescription, setProductDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const [subreddits, setSubreddits] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([])
  // Keywords auto-fill from the same suggestion call below — collapsed by default
  // so accepting the defaults means never seeing this at all.
  const [keywordsExpanded, setKeywordsExpanded] = useState(false)

  const canContinue = productDescription.trim().length >= MIN_DESCRIPTION_LENGTH
  const remainingSlots = Math.max(0, MAX_SUBREDDITS - subreddits.length)

  function addSubreddits(names: string[]) {
    setSubreddits((prev) => {
      const existing = new Set(prev.map((s) => s.toLowerCase()))
      const additions = names.filter((n) => !existing.has(n.toLowerCase()))
      return [...prev, ...additions].slice(0, MAX_SUBREDDITS)
    })
  }

  async function handleFinish() {
    if (subreddits.length === 0) {
      toast.error('Pick at least one subreddit so there is something to search')
      return
    }
    if (keywords.length === 0) {
      setKeywordsExpanded(true)
      toast.error('Add at least one keyword so there is something to search')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subreddits,
          keywords,
          product_description: productDescription,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }

      router.push('/dashboard')
      // Deliberately not clearing `saving` here: the button stays disabled through
      // the navigation so a second click can't fire another save.
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-bold text-brand-text-strong tracking-tight text-sm">SubRadar</span>
        </div>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-brand-text-strong">Set up your radar</h1>
          <p className="text-sm text-brand-text-muted">
            Step {step} of 2 — {step === 1 ? 'describe what you sell' : 'choose what to watch'}
          </p>
        </header>

        {step === 1 && (
          <div className="space-y-4 animate-fade-up">
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-brand-text-strong">What do you sell?</h2>
              <p className="text-sm text-brand-text-muted max-w-prose">
                Who it&apos;s for and what problem it solves. This is what we use to find the
                communities your buyers are already posting in.
              </p>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={5}
                placeholder="A time-tracking app for freelance designers who bill hourly and keep forgetting to start the timer…"
                aria-label="Product description"
                className="w-full rounded-md border border-brand-surface-border bg-white px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-xs text-brand-text-muted tabular-nums">
                {productDescription.trim().length} / {MIN_DESCRIPTION_LENGTH} characters minimum
              </p>
            </section>

            <Button onClick={() => setStep(2)} disabled={!canContinue}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-10 animate-fade-up">
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-brand-text-strong">Subreddits</h2>
                <span className="text-xs tabular-nums text-brand-text-muted">
                  {subreddits.length}/{MAX_SUBREDDITS}
                </span>
              </div>

              <SubredditSuggester
                productDescription={productDescription}
                existing={subreddits}
                remainingSlots={remainingSlots}
                onAdd={addSubreddits}
                onKeywords={(kws) => {
                  setKeywordSuggestions(kws)
                  // Prefill on the first suggestion run so a user who accepts the
                  // defaults lands on a working setup rather than an empty one.
                  setKeywords((prev) => (prev.length === 0 ? kws.slice(0, 8) : prev))
                }}
              />

              {subreddits.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {subreddits.map((sub) => (
                    <li
                      key={sub}
                      className="chip-enter inline-flex items-center gap-1.5 rounded-full border border-brand-surface-border bg-white px-3 py-1 text-xs font-medium"
                    >
                      r/{sub}
                      <button
                        onClick={() => setSubreddits((prev) => prev.filter((s) => s !== sub))}
                        aria-label={`Remove r/${sub}`}
                        className="text-brand-text-muted transition-colors hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <SubredditAdder
                existing={subreddits}
                onAdd={(name) => addSubreddits([name])}
                disabled={remainingSlots === 0}
              />
            </section>

            <div className="space-y-3">
              <button
                onClick={() => setKeywordsExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-text-muted hover:text-brand-text"
                aria-expanded={keywordsExpanded}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${keywordsExpanded ? 'rotate-180' : ''}`} />
                Advanced: edit search phrases
                <span className="tabular-nums text-xs">({keywords.length})</span>
              </button>
              {keywordsExpanded && (
                <div className="animate-fade-up">
                  <KeywordEditor
                    keywords={keywords}
                    onChange={setKeywords}
                    suggestions={keywordSuggestions}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <Button onClick={handleFinish} disabled={saving}>
                {saving ? 'Saving…' : 'Start watching'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
