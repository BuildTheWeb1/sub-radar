'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { X, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Campaign } from '@/lib/types'

interface SubredditSuggestion {
  name: string
  reason: string
}

const MIN_DESCRIPTION_LENGTH = 20
const MAX_SUBREDDITS = 10

export default function OnboardingPage() {
  const router = useRouter()

  const [step, setStep] = useState<1 | 2>(1)
  const [productDescription, setProductDescription] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [suggestions, setSuggestions] = useState<SubredditSuggestion[]>([])
  const [selectedSubreddits, setSelectedSubreddits] = useState<Set<string>>(new Set())
  const [keywords, setKeywords] = useState<string[]>([])
  const [newSubreddit, setNewSubreddit] = useState('')
  const [newKeyword, setNewKeyword] = useState('')

  const canSubmitDescription = productDescription.trim().length >= MIN_DESCRIPTION_LENGTH

  async function handleGetSuggestions() {
    if (!canSubmitDescription) return
    setSuggesting(true)
    setSuggestError(null)
    try {
      const res = await fetch('/api/onboarding/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDescription }),
      })
      if (!res.ok) {
        throw new Error('suggestion_failed')
      }
      const data: { subreddits: SubredditSuggestion[]; keywords: string[] } = await res.json()
      setSuggestions(data.subreddits ?? [])
      setSelectedSubreddits(new Set((data.subreddits ?? []).slice(0, MAX_SUBREDDITS).map((s) => s.name)))
      setKeywords(data.keywords ?? [])
      setStep(2)
    } catch {
      setSuggestError('We could not generate suggestions right now. You can retry, or continue and add subreddits and keywords manually.')
    } finally {
      setSuggesting(false)
    }
  }

  function skipToManualEntry() {
    setSuggestError(null)
    setSuggestions([])
    setSelectedSubreddits(new Set())
    setKeywords([])
    setStep(2)
  }

  function toggleSubreddit(name: string) {
    setSelectedSubreddits((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        if (next.size >= MAX_SUBREDDITS) {
          toast.error(`You can monitor up to ${MAX_SUBREDDITS} subreddits`)
          return prev
        }
        next.add(name)
      }
      return next
    })
  }

  function addSubreddit() {
    const val = newSubreddit.trim().replace(/^r\//, '')
    if (!val) return
    if (!selectedSubreddits.has(val) && selectedSubreddits.size >= MAX_SUBREDDITS) {
      toast.error(`You can monitor up to ${MAX_SUBREDDITS} subreddits`)
      return
    }
    if (!suggestions.some((s) => s.name === val)) {
      setSuggestions((s) => [...s, { name: val, reason: 'Added manually' }])
    }
    setSelectedSubreddits((prev) => new Set(prev).add(val))
    setNewSubreddit('')
  }

  function addKeyword() {
    const val = newKeyword.trim().toLowerCase()
    if (!val || keywords.includes(val) || keywords.length >= 20) return
    setKeywords((k) => [...k, val])
    setNewKeyword('')
  }

  async function handleSaveAndContinue() {
    setSaving(true)
    try {
      const current: Campaign = await fetch('/api/config').then((r) => r.json())

      const finalSubreddits = Array.from(selectedSubreddits)
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: current.name,
          subreddits: finalSubreddits,
          keywords,
          product_description: productDescription,
          scrape_frequency: current.scrape_frequency,
          min_relevance: current.min_relevance,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }

      toast.success('Setup complete')
      router.push('/dashboard')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fffbf5] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#ea580c] rounded-[5px] flex items-center justify-center">
            <div className="w-[7px] h-[7px] rounded-full bg-white opacity-90" />
          </div>
          <span className="font-bold text-[#1c0a00] tracking-tight text-sm">SubRadar</span>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Let&apos;s set up your monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of 2 — {step === 1 ? 'Describe your product' : 'Review and confirm'}
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Product description</h2>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={5}
                placeholder="Describe what your product does and who it's for (at least 20 characters)…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {productDescription.trim().length}/{MIN_DESCRIPTION_LENGTH} characters minimum
              </p>
            </section>

            {suggestError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {suggestError}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGetSuggestions} disabled={!canSubmitDescription || suggesting}>
                {suggesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating suggestions…
                  </>
                ) : (
                  'Get suggestions'
                )}
              </Button>
              <Button variant="outline" onClick={skipToManualEntry} disabled={suggesting}>
                Skip &amp; enter manually
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            {suggestError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {suggestError}
              </div>
            )}

            {/* Subreddits */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Subreddits{' '}
                <span className="text-muted-foreground font-normal">
                  ({selectedSubreddits.size}/{MAX_SUBREDDITS} selected)
                </span>
              </h2>
              {suggestions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No suggestions yet — add subreddits manually below.
                </p>
              )}
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const checked = selectedSubreddits.has(s.name)
                  return (
                    <label
                      key={s.name}
                      className="flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSubreddit(s.name)}
                        className="mt-0.5 accent-foreground"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">r/{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.reason}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newSubreddit}
                  onChange={(e) => setNewSubreddit(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubreddit())}
                  placeholder="Add a subreddit, e.g. loseit"
                  className="flex-1 min-w-0 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="sm" variant="outline" onClick={addSubreddit}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Keywords */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">
                Keywords <span className="text-muted-foreground font-normal">({keywords.length}/20)</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  >
                    {kw}
                    <button onClick={() => setKeywords((k) => k.filter((x) => x !== kw))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {keywords.length === 0 && (
                  <p className="text-sm text-muted-foreground">No keywords yet — add some below.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  placeholder="e.g. mental clarity"
                  className="flex-1 min-w-0 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="sm" variant="outline" onClick={addKeyword} disabled={keywords.length >= 20}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <Button onClick={handleSaveAndContinue} disabled={saving}>
                {saving ? 'Saving…' : 'Save & continue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
