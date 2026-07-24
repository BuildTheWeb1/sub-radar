'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, Sparkles, RefreshCw, Inbox } from 'lucide-react'

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

  async function generate() {
    setStatus('loading')
    try {
      const res = await fetch('/api/content-ideas')
      if (!res.ok) {
        setStatus('error')
        return
      }
      const data: ContentIdeas = await res.json()
      setIdeas(data)
      setHasGenerated(true)
      setStatus('idle')
    } catch {
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
            <Lightbulb className="h-5 w-5 text-[#c2410c]" />
            Content Ideas
          </h1>
          <p className="text-xs text-[#9a6b4b] mt-1 max-w-xl">
            We mine the Reddit posts already collected for your campaign to surface recurring
            audience pain points, plus ready-to-write post ideas for your own LinkedIn or
            Twitter.
          </p>
        </div>
        <Button onClick={generate} disabled={status === 'loading'} className="gap-1.5 shrink-0">
          <Sparkles className="h-4 w-4" />
          {status === 'loading'
            ? 'Generating…'
            : hasGenerated
              ? 'Regenerate'
              : 'Generate content ideas'}
        </Button>
      </div>

      {status === 'loading' && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[#fde8cc] bg-[#fffbf5] p-4 space-y-3 animate-pulse">
              <div className="h-4 w-1/3 bg-[#fde8cc] rounded" />
              <div className="h-3 w-2/3 bg-[#fde8cc] rounded" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Inbox className="h-10 w-10 text-[#fde8cc]" />
          <p className="text-sm font-semibold text-[#431407]">
            Couldn&apos;t generate content ideas
          </p>
          <p className="text-xs text-[#9a6b4b]">Something went wrong. Please try again.</p>
          <Button variant="outline" size="sm" onClick={generate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {status === 'idle' && isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Inbox className="h-10 w-10 text-[#fde8cc]" />
          <p className="text-sm font-semibold text-[#431407]">No posts to work with yet</p>
          <p className="text-xs text-[#9a6b4b]">
            Collect some posts first — run a scrape, then come back.
          </p>
        </div>
      )}

      {status === 'idle' && ideas && !isEmpty && (
        <div className="space-y-8">
          {ideas.painPoints.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-[#431407]">Pain points</h2>
              <div className="space-y-3">
                {ideas.painPoints.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[#fde8cc] bg-[#fffbf5] p-4 space-y-1.5 hover:border-[#fed7aa] hover:shadow-md transition-all"
                    style={{ boxShadow: '0 1px 4px rgba(234,88,12,0.07)' }}
                  >
                    <p className="font-medium text-sm text-[#431407]">{p.theme}</p>
                    <p className="text-xs text-muted-foreground">{p.evidence}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ideas.postIdeas.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-[#431407]">Post ideas</h2>
              <div className="space-y-3">
                {ideas.postIdeas.map((idea, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[#fde8cc] bg-[#fffbf5] p-4 space-y-2 hover:border-[#fed7aa] hover:shadow-md transition-all"
                    style={{ boxShadow: '0 1px 4px rgba(234,88,12,0.07)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-sm leading-snug text-[#431407]">
                        {idea.hook}
                      </p>
                      <Badge variant="outline" className="shrink-0 text-[#9a6b4b] border-[#fde8cc]">
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
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Lightbulb className="h-10 w-10 text-[#fde8cc]" />
          <p className="text-sm font-semibold text-[#431407]">Ready when you are</p>
          <p className="text-xs text-[#9a6b4b]">
            Click &ldquo;Generate content ideas&rdquo; to mine your collected posts.
          </p>
        </div>
      )}
    </div>
  )
}
