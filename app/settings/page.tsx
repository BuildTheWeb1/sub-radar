'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { X, Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Campaign, SubredditGuideline } from '@/lib/types'
import { BanRiskBadge } from '@/components/ban-risk-badge'

const SELF_PROMO_LABELS: Record<SubredditGuideline['self_promo_policy'], string> = {
  allowed: 'Allowed',
  limited: 'Limited',
  banned: 'Banned',
  unknown: 'Unknown',
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [subreddits, setSubreddits] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [productDescription, setProductDescription] = useState('')
  const [scrapeFrequency, setScrapeFrequency] = useState('2h')
  const [minRelevance, setMinRelevance] = useState(20)
  const [newSubreddit, setNewSubreddit] = useState('')
  const [newKeyword, setNewKeyword] = useState('')

  const [guidelines, setGuidelines] = useState<SubredditGuideline[]>([])
  const [guidelinesLoading, setGuidelinesLoading] = useState(true)
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('config_load_failed')
        return r.json()
      })
      .then((data: Campaign) => {
        setSubreddits(data.subreddits ?? [])
        setKeywords(data.keywords ?? [])
        setProductDescription(data.product_description ?? '')
        setScrapeFrequency(data.scrape_frequency ?? '2h')
        setMinRelevance(data.min_relevance ?? 20)
      })
      .catch(() => setLoadError('Could not load your settings. Try refreshing the page.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/guidelines')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SubredditGuideline[]) => setGuidelines(Array.isArray(data) ? data : []))
      .catch(() => setGuidelines([]))
      .finally(() => setGuidelinesLoading(false))
  }, [])

  function toggleRules(subreddit: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(subreddit)) next.delete(subreddit)
      else next.add(subreddit)
      return next
    })
  }

  function addSubreddit() {
    const val = newSubreddit.trim().replace(/^r\//, '')
    if (!val || subreddits.includes(val) || subreddits.length >= 10) return
    setSubreddits((s) => [...s, val])
    setNewSubreddit('')
  }

  function addKeyword() {
    const val = newKeyword.trim().toLowerCase()
    if (!val || keywords.includes(val) || keywords.length >= 20) return
    setKeywords((k) => [...k, val])
    setNewKeyword('')
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subreddits,
          keywords,
          product_description: productDescription,
          scrape_frequency: scrapeFrequency,
          min_relevance: minRelevance,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success('Settings saved')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your Reddit monitoring</p>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {/* Subreddits */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-text-strong">Subreddits <span className="text-brand-text-muted font-normal text-sm">({subreddits.length}/10)</span></h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {subreddits.map((sub) => (
            <span key={sub} className="chip-enter inline-flex items-center gap-1 rounded-full border border-brand-surface-border px-2.5 py-0.5 text-xs font-medium">
              r/{sub}
              <button onClick={() => setSubreddits((s) => s.filter((x) => x !== sub))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newSubreddit}
            onChange={(e) => setNewSubreddit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubreddit()}
            placeholder="e.g. loseit"
            className="flex-1 min-w-0 rounded-md border border-brand-surface-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={addSubreddit} disabled={subreddits.length >= 10}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Subreddit guidelines */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-text-strong">Subreddit guidelines</h2>
        {guidelinesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : guidelines.length === 0 ? (
          <p className="text-xs text-brand-text-muted">
            Add subreddits to see their posting guidelines.
          </p>
        ) : (
          <div className="space-y-2 animate-fade-up">
            {guidelines.map((g) => {
              const isExpanded = expandedRules.has(g.subreddit)
              return (
                <div key={g.subreddit} className="rounded-md border border-brand-surface-border bg-brand-surface p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">r/{g.subreddit}</span>
                    <BanRiskBadge risk={g.risk} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Self-promo: <span className="text-foreground">{SELF_PROMO_LABELS[g.self_promo_policy]}</span>
                    </span>
                    <span>
                      Links allowed: <span className="text-foreground">{g.links_allowed ? 'Yes' : 'No'}</span>
                    </span>
                    {g.min_karma !== null && (
                      <span>
                        Min karma: <span className="text-foreground">{g.min_karma}</span>
                      </span>
                    )}
                    {g.min_account_age_days !== null && (
                      <span>
                        Min account age: <span className="text-foreground">{g.min_account_age_days}d</span>
                      </span>
                    )}
                  </div>
                  {g.cadence_note && (
                    <p className="text-xs text-muted-foreground">{g.cadence_note}</p>
                  )}
                  {g.rules.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleRules(g.subreddit)}
                        aria-expanded={isExpanded}
                        className="flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                      >
                        <ChevronRight
                          className={`h-3 w-3 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        {isExpanded ? 'Hide' : 'Show'} rules ({g.rules.length})
                      </button>
                      <div className="disclosure-rows" data-open={isExpanded}>
                        <div>
                          <ul className="mt-2 space-y-2 pl-1">
                            {g.rules.map((rule, i) => (
                              <li key={i} className="text-xs">
                                <span className="font-medium">{rule.title}</span>
                                {rule.description && (
                                  <p className="text-muted-foreground">{rule.description}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Keywords */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-text-strong">Keywords <span className="text-brand-text-muted font-normal text-sm">({keywords.length}/20)</span></h2>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span key={kw} className="chip-enter inline-flex items-center gap-1 rounded-full border border-brand-surface-border px-2.5 py-0.5 text-xs font-medium">
              {kw}
              <button onClick={() => setKeywords((k) => k.filter((x) => x !== kw))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder="e.g. mental clarity"
            className="flex-1 min-w-0 rounded-md border border-brand-surface-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={addKeyword} disabled={keywords.length >= 20}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Product description */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-brand-text-strong">Product description</h2>
        <textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          rows={3}
          placeholder="Describe your product for future AI reply drafting…"
          className="w-full rounded-md border border-brand-surface-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </section>

      {/* Scrape frequency + min relevance — single controls, lighter weight than the sections above */}
      <section className="flex flex-wrap items-start gap-x-8 gap-y-4 pt-2 border-t border-brand-surface-border">
        <div className="space-y-1.5">
          <h2 className="text-xs font-medium text-brand-text-muted">Scrape frequency</h2>
          <Select value={scrapeFrequency} onValueChange={(v) => v && setScrapeFrequency(v)}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Every 1 hour</SelectItem>
              <SelectItem value="2h">Every 2 hours</SelectItem>
              <SelectItem value="6h">Every 6 hours</SelectItem>
              <SelectItem value="12h">Every 12 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 flex-1 min-w-48">
          <h2 className="text-xs font-medium text-brand-text-muted">Minimum relevance score: <span className="text-brand-text">{minRelevance}</span></h2>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minRelevance}
            onChange={(e) => setMinRelevance(Number(e.target.value))}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-xs text-brand-text-muted">
            <span>0 (show all)</span>
            <span>100 (most relevant)</span>
          </div>
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}
