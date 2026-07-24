import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

export interface PainPoint {
  theme: string
  evidence: string
}

export interface PostIdea {
  hook: string
  angle: string
  format: string
}

export interface ContentIdeas {
  painPoints: PainPoint[]
  postIdeas: PostIdea[]
}

interface ContentIdeasPost {
  title: string
  body: string | null
  subreddit: string
}

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `You are an expert content strategist who studies real Reddit conversations to help a creator write content that resonates with that same audience on their own LinkedIn/Twitter.

Respond with STRICT JSON only — no markdown code fences, no prose before or after. The JSON must match exactly this shape:
{"painPoints":[{"theme":"...","evidence":"..."}],"postIdeas":[{"hook":"...","angle":"...","format":"..."}]}

Rules:
- Provide 4-6 pain points: recurring frustrations, struggles, or questions the audience keeps raising in these posts. Each "theme" is a short label (a few words). Each "evidence" is one line grounded in what the posts actually say (paraphrase, don't invent details not implied by the posts).
- Provide 5-8 post ideas: things the reader could write for THEIR OWN LinkedIn or Twitter to speak directly to this audience and its pain points. Each "hook" is a scroll-stopping opening line. Each "angle" is a one-line description of the point/argument the post makes. Each "format" is a short suggested format, e.g. "LinkedIn post", "Twitter thread", "short tip", "carousel".
- Ground everything in the actual posts provided — do not fabricate unrelated content.
- Output only the JSON object, nothing else.`

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  // Strip common code fence wrapping, e.g. ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
  // Fall back to grabbing the first {...} block in case of extra prose.
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

function normalizePainPoints(input: unknown): PainPoint[] {
  if (!Array.isArray(input)) return []
  const result: PainPoint[] = []

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rawTheme = (item as Record<string, unknown>).theme
    const rawEvidence = (item as Record<string, unknown>).evidence
    if (typeof rawTheme !== 'string' || typeof rawEvidence !== 'string') continue

    const theme = rawTheme.trim()
    const evidence = rawEvidence.trim()
    if (!theme || !evidence) continue

    result.push({ theme, evidence })
  }

  return result
}

function normalizePostIdeas(input: unknown): PostIdea[] {
  if (!Array.isArray(input)) return []
  const result: PostIdea[] = []

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rawHook = (item as Record<string, unknown>).hook
    const rawAngle = (item as Record<string, unknown>).angle
    const rawFormat = (item as Record<string, unknown>).format
    if (
      typeof rawHook !== 'string' ||
      typeof rawAngle !== 'string' ||
      typeof rawFormat !== 'string'
    )
      continue

    const hook = rawHook.trim()
    const angle = rawAngle.trim()
    const format = rawFormat.trim()
    if (!hook || !angle || !format) continue

    result.push({ hook, angle, format })
  }

  return result
}

function formatPostsForPrompt(posts: ContentIdeasPost[]): string {
  return posts
    .map((post, i) => {
      const body = post.body ? post.body.slice(0, 500) : '(no body text)'
      return `${i + 1}. [r/${post.subreddit}] ${post.title}\n${body}`
    })
    .join('\n\n')
}

/**
 * Uses Claude Haiku to mine a batch of already-collected Reddit posts for
 * recurring audience pain points and matching content ideas the user could
 * post themselves. Server-only: reads ANTHROPIC_API_KEY.
 */
export async function generateContentIdeas(
  posts: ContentIdeasPost[]
): Promise<ContentIdeas> {
  if (posts.length === 0) {
    return { painPoints: [], postIdeas: [] }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Real Reddit posts from this niche:\n\n${formatPostsForPrompt(posts)}`,
      },
    ],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('[content-ideas] No text content in Claude response')
  }

  const jsonCandidate = extractJson(textBlock.text)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonCandidate)
  } catch {
    throw new Error('[content-ideas] Failed to parse Claude response as JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('[content-ideas] Claude response JSON was not an object')
  }

  const painPoints = normalizePainPoints((parsed as Record<string, unknown>).painPoints)
  const postIdeas = normalizePostIdeas((parsed as Record<string, unknown>).postIdeas)

  return { painPoints, postIdeas }
}
