'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ChevronDown } from 'lucide-react'
import type { Campaign, SubredditGuideline } from '@/lib/types'
import type { RadarPayload } from '@/app/api/radar/route'
import { SubredditSuggester } from '@/components/radar/subreddit-suggester'
import { SubredditAdder } from '@/components/radar/subreddit-adder'
import { TargetList } from '@/components/radar/target-list'
import { KeywordEditor } from '@/components/radar/keyword-editor'

const MAX_SUBREDDITS = 10

export default function RadarPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [guidelines, setGuidelines] = useState<Record<string, SubredditGuideline>>({})
  const [postCounts, setPostCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Working copy. Radar edits three fields; everything else on the campaign is
  // round-tripped untouched so saving here can't clobber Settings.
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [productDescription, setProductDescription] = useState('')
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([])
  // Keywords are an implementation detail (verbatim substring matches under the
  // hood) — most users should never need to see or touch them. Collapsed by
  // default; the save() guard below flips this to true instead of submitting
  // when subreddits are watched but the keyword list is empty, since that
  // combination means nothing would ever get searched.
  const [keywordsExpanded, setKeywordsExpanded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/radar')
      if (!res.ok) throw new Error('load_failed')
      const data: RadarPayload = await res.json()

      setCampaign(data.campaign)
      setSubreddits(data.campaign.subreddits ?? [])
      setKeywords(data.campaign.keywords ?? [])
      setProductDescription(data.campaign.product_description ?? '')
      setPostCounts(data.post_counts ?? {})

      const map: Record<string, SubredditGuideline> = {}
      for (const g of data.guidelines ?? []) map[g.subreddit.toLowerCase()] = g
      setGuidelines(map)
    } catch {
      setLoadError('Could not load your radar. Refresh to try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirty = useMemo(() => {
    if (!campaign) return false
    return (
      JSON.stringify(subreddits) !== JSON.stringify(campaign.subreddits ?? []) ||
      JSON.stringify(keywords) !== JSON.stringify(campaign.keywords ?? []) ||
      productDescription !== (campaign.product_description ?? '')
    )
  }, [campaign, subreddits, keywords, productDescription])

  function addSubreddits(names: string[]) {
    setSubreddits((prev) => {
      const existing = new Set(prev.map((s) => s.toLowerCase()))
      const additions = names.filter((n) => !existing.has(n.toLowerCase()))
      const next = [...prev, ...additions].slice(0, MAX_SUBREDDITS)
      if (prev.length + additions.length > MAX_SUBREDDITS) {
        toast.error(`Kept the first ${MAX_SUBREDDITS} — that's the limit`)
      }
      return next
    })
  }

  // One button, one behavior: saving always scans when targets actually changed.
  // /api/config starts that scan itself in the common case (see scanStarted in
  // its response) — but it deliberately skips starting one when a job is already
  // open for this campaign (see the guard in /api/config's POST handler), so a
  // save that changed targets while a scan was mid-flight would otherwise save
  // silently with no signal that the new targets aren't being watched yet. The
  // fallback below covers exactly that gap; it's the same call the old "Save &
  // scan now" button made, just triggered by target-dirtiness instead of a
  // second button.
  async function save() {
    if (!campaign) return
    // Unlike onboarding, an already-configured campaign is allowed to save with
    // both lists empty — that's how a user pauses targeting entirely without
    // deleting the campaign. Only guard the combination that's never useful:
    // subreddits with nothing to search them for.
    if (subreddits.length > 0 && keywords.length === 0) {
      setKeywordsExpanded(true)
      toast.error('Add at least one keyword so there is something to search')
      return
    }
    const targetsChanged =
      JSON.stringify(subreddits) !== JSON.stringify(campaign.subreddits ?? []) ||
      JSON.stringify(keywords) !== JSON.stringify(campaign.keywords ?? [])
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the three fields this page owns — see the partial-update note in
        // /api/config. Sending scrape_frequency here would let a stale Radar tab
        // revert a change made in Settings.
        body: JSON.stringify({
          subreddits,
          keywords,
          product_description: productDescription,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save')

      setCampaign(data as Campaign)
      toast.success('Radar updated')

      if (targetsChanged && !(data as Campaign & { scanStarted?: boolean }).scanStarted) {
        const scanRes = await fetch('/api/scrape/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign.id }),
        })
        const scanData = await scanRes.json().catch(() => ({}))
        if (!scanRes.ok) {
          toast.error(scanData.error || 'Saved, but the scan could not start')
        }
      }

      // Pull guidelines and counts for anything newly added.
      load()
    } catch (err) {
      toast.error((err as Error).message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const remainingSlots = Math.max(0, MAX_SUBREDDITS - subreddits.length)
  const hasScraped = Boolean(campaign?.last_scraped_at)

  return (
    <div className="max-w-2xl space-y-10 pb-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-text-strong">Radar</h1>
        <p className="text-sm text-brand-text-muted max-w-prose">
          The subreddits and keywords the scanner searches. Every post in your feed came from
          a pairing of the two.
        </p>
      </header>

      {loadError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {loadError}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-brand-text-strong">What you sell</h2>
        <p className="text-sm text-brand-text-muted max-w-prose">
          Used to suggest communities and to shape your content ideas.
        </p>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            rows={3}
            placeholder="Who it's for and what problem it solves…"
            aria-label="Product description"
            className="w-full rounded-md border border-brand-surface-border bg-white px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-brand-text-strong">Subreddits</h2>
          <span className="text-xs tabular-nums text-brand-text-muted">
            {subreddits.length}/{MAX_SUBREDDITS}
          </span>
        </div>

        {!loading && (
          <SubredditSuggester
            productDescription={productDescription}
            existing={subreddits}
            remainingSlots={remainingSlots}
            onAdd={addSubreddits}
            onKeywords={(kws) => {
              setKeywordSuggestions(kws)
              // Keywords are implementation detail, not a decision most users want
              // to make — auto-apply the model's suggestions the same way
              // onboarding does, so accepting the defaults produces a working
              // setup without ever opening the (collapsed) editor below.
              setKeywords((prev) => (prev.length === 0 ? kws.slice(0, 8) : prev))
            }}
          />
        )}

        <TargetList
          subreddits={subreddits}
          guidelines={guidelines}
          postCounts={postCounts}
          onRemove={(name) => setSubreddits((prev) => prev.filter((s) => s !== name))}
          loading={loading}
          hasScraped={hasScraped}
        />

        <SubredditAdder
          existing={subreddits}
          onAdd={(name) => addSubreddits([name])}
          disabled={loading || remainingSlots === 0}
        />
      </section>

      <section>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
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
        )}
      </section>

      {/* Only mounted while there is something to save, so it never sits there as
          furniture. Fixed above the mobile tab bar. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-14 md:bottom-0 z-40 border-t border-brand-surface-border bg-background">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-end gap-2 px-4 sm:px-6 py-3">
            <p className="mr-auto text-sm text-brand-text-muted">
              Unsaved changes to your radar
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                if (!campaign) return
                setSubreddits(campaign.subreddits ?? [])
                setKeywords(campaign.keywords ?? [])
                setProductDescription(campaign.product_description ?? '')
              }}
            >
              Discard
            </Button>
            <Button size="sm" disabled={saving} onClick={() => save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
