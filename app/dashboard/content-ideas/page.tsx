'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, Sparkles, RefreshCw, Inbox } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { CONTENT_IDEAS_COST } from '@/lib/credit-costs'
import { pluralize } from '@/lib/utils'
import { insufficientCreditsCopy, showInsufficientCreditsToast } from '@/lib/insufficient-credits-toast'

interface PainPoint {
  theme: string
  evidence: string
}

interface PostIdea {
  hook: string
  angle: string
  format: string
}

interface ContentIdeas {
  painPoints: PainPoint[]
  postIdeas: PostIdea[]
}

type Status = 'idle' | 'loading' | 'error'

export default function ContentIdeasPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [ideas, setIdeas] = useState<ContentIdeas | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function generate() {
    setStatus('loading')
    try {
      const res = await fetch('/api/content-ideas', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 402 && typeof data.need === 'number' && typeof data.have === 'number') {
          // Same numbers, same wording, in both places — the toast and this
          // banner used to source their text from different fields (a
          // computed shortfall vs. the API's raw "need N" string) and could
          // quote two different "need" figures for one failure.
          showInsufficientCreditsToast(data.need, data.have)
          setErrorMessage(insufficientCreditsCopy(data.need, data.have).description)
        } else {
          setErrorMessage(
            res.status === 402 ? data.error || 'Not enough credits to generate content ideas.' : null
          )
        }
        setStatus('error')
        return
      }
      const data: ContentIdeas = await res.json()
      setIdeas(data)
      setHasGenerated(true)
      setStatus('idle')
    } catch {
      setErrorMessage(null)
      setStatus('error')
    }
  }

  const isEmpty =
    hasGenerated && ideas && ideas.painPoints.length === 0 && ideas.postIdeas.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-brand-accent" />
            Content Ideas
          </h1>
          <p className="text-xs text-brand-text-muted mt-1 max-w-xl">
            We mine the Reddit posts already collected for your campaign to surface recurring
            audience pain points, plus ready-to-write post ideas for your own LinkedIn or
            Twitter.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Button onClick={generate} disabled={status === 'loading'} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {status === 'loading'
              ? 'Generating…'
              : hasGenerated
                ? 'Regenerate'
                : 'Generate content ideas'}
          </Button>
          {/* "Up to", not a flat price: the route charges nothing when there are no
              posts to mine yet (see app/api/content-ideas/route.ts) — this stays
              accurate on a fresh campaign without needing to know that in advance. */}
          <p className="text-xs text-brand-text-muted">
            Up to {pluralize(CONTENT_IDEAS_COST, 'credit')}
          </p>
        </div>
      </div>

      {status === 'loading' && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-3 animate-pulse">
              <div className="h-4 w-1/3 bg-brand-surface-border rounded" />
              <div className="h-3 w-2/3 bg-brand-surface-border rounded" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-surface-border bg-brand-surface px-4 py-3 animate-fade-up">
          <Inbox className="h-5 w-5 shrink-0 text-brand-text-muted" />
          <p className="text-sm flex-1">
            <span className="font-semibold text-brand-text">Couldn&apos;t generate content ideas.</span>{' '}
            <span className="text-brand-text-muted">{errorMessage || 'Something went wrong.'}</span>
          </p>
          <Button variant="outline" size="sm" onClick={generate} className="gap-1.5 shrink-0">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {status === 'idle' && isEmpty && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-surface-border bg-brand-surface px-4 py-3 animate-fade-up">
          <Inbox className="h-5 w-5 shrink-0 text-brand-text-muted" />
          <p className="text-sm">
            <span className="font-semibold text-brand-text">No posts to work with yet.</span>{' '}
            <span className="text-brand-text-muted">Run a scrape, then come back.</span>
          </p>
        </div>
      )}

      {status === 'idle' && ideas && !isEmpty && (
        <div className="space-y-8 animate-fade-up">
          {ideas.painPoints.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-brand-text">Pain points</h2>
              <div className="space-y-3">
                {ideas.painPoints.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-1.5 transition-colors duration-150 ease-out hover:border-brand-surface-border-hover"
                    style={{ boxShadow: '0 1px 4px rgba(234,88,12,0.07)' }}
                  >
                    <p className="font-medium text-sm text-brand-text">{p.theme}</p>
                    <p className="text-xs text-muted-foreground">{p.evidence}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ideas.postIdeas.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-brand-text">Post ideas</h2>
              <div className="space-y-3">
                {ideas.postIdeas.map((idea, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-brand-surface-border bg-brand-surface p-4 space-y-2 transition-colors duration-150 ease-out hover:border-brand-surface-border-hover"
                    style={{ boxShadow: '0 1px 4px rgba(234,88,12,0.07)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-sm leading-snug text-brand-text">
                        {idea.hook}
                      </p>
                      <Badge variant="outline" className="shrink-0 text-brand-text-muted border-brand-surface-border">
                        {idea.format}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{idea.angle}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {status === 'idle' && !hasGenerated && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3 rounded-lg border border-brand-surface-border bg-brand-surface">
          <BrandMark size="lg" />
          <p className="text-sm font-semibold text-brand-text">Ready when you are</p>
          <p className="text-xs text-brand-text-muted">
            Click &ldquo;Generate content ideas&rdquo; to mine your collected posts.
          </p>
        </div>
      )}
    </div>
  )
}
