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
import { X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Config } from '@/lib/types'

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [subreddits, setSubreddits] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [productDescription, setProductDescription] = useState('')
  const [scrapeFrequency, setScrapeFrequency] = useState('2h')
  const [minRelevance, setMinRelevance] = useState(20)
  const [newSubreddit, setNewSubreddit] = useState('')
  const [newKeyword, setNewKeyword] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: Config) => {
        setConfig(data)
        setSubreddits(data.subreddits ?? [])
        setKeywords(data.keywords ?? [])
        setProductDescription(data.product_description ?? '')
        setScrapeFrequency(data.scrape_frequency ?? '2h')
        setMinRelevance(data.min_relevance ?? 20)
      })
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your Reddit monitoring</p>
      </div>

      {/* Subreddits */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Subreddits <span className="text-muted-foreground font-normal">({subreddits.length}/10)</span></h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {subreddits.map((sub) => (
            <span key={sub} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
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
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={addSubreddit} disabled={subreddits.length >= 10}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Keywords */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Keywords <span className="text-muted-foreground font-normal">({keywords.length}/20)</span></h2>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <span key={kw} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
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
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" variant="outline" onClick={addKeyword} disabled={keywords.length >= 20}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Product description */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Product description</h2>
        <textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          rows={3}
          placeholder="Describe your product for future AI reply drafting…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </section>

      {/* Scrape frequency */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Scrape frequency</h2>
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
      </section>

      {/* Min relevance */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Minimum relevance score: <span className="text-foreground">{minRelevance}</span></h2>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={minRelevance}
          onChange={(e) => setMinRelevance(Number(e.target.value))}
          className="w-full accent-foreground"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 (show all)</span>
          <span>100 (most relevant)</span>
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}
