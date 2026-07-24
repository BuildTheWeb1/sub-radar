import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

export interface SubredditSuggestion {
  name: string
  reason: string
}

export interface OnboardingSuggestions {
  subreddits: SubredditSuggestion[]
  keywords: string[]
}

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `You are an expert at Reddit community research and customer discovery. Given a short product description, you identify where the product's target users actually hang out on Reddit and how they naturally talk about the problem the product solves.

Respond with STRICT JSON only — no markdown code fences, no prose before or after. The JSON must match exactly this shape:
{"subreddits":[{"name":"...","reason":"..."}],"keywords":["..."]}

Rules:
- Provide 8-10 subreddit suggestions. Each "name" must be the subreddit name WITHOUT the "r/" prefix (e.g. "SaaS", not "r/SaaS").
- Each "reason" is a single concise sentence explaining why that community's members are relevant to this specific product.
- Only suggest real, plausible, active subreddits where this product's target users would actually discuss the relevant problem — not generic large subreddits unless truly relevant.
- Provide 10-15 keyword phrases: natural language a real user would type when discussing the problem (e.g. "how do I track competitors on reddit"), NOT marketing or SEO terms.
- Do not include duplicate subreddits or keywords.
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

function normalizeSubreddits(input: unknown): SubredditSuggestion[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: SubredditSuggestion[] = []

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rawName = (item as Record<string, unknown>).name
    const rawReason = (item as Record<string, unknown>).reason
    if (typeof rawName !== 'string' || typeof rawReason !== 'string') continue

    const name = rawName.trim().replace(/^r\//i, '')
    const reason = rawReason.trim()
    if (!name || !reason) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    result.push({ name, reason })
  }

  return result
}

function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of input) {
    if (typeof item !== 'string') continue
    const keyword = item.trim()
    if (!keyword) continue

    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    result.push(keyword)
  }

  return result
}

/**
 * Uses Claude Haiku to suggest relevant subreddits (with a one-line reason
 * each) and natural-language keyword phrases for a given product description.
 * Server-only: reads ANTHROPIC_API_KEY.
 */
export async function suggestSubredditsAndKeywords(
  productDescription: string
): Promise<OnboardingSuggestions> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Product description:\n${productDescription}`,
      },
    ],
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('[onboarding] No text content in Claude response')
  }

  const jsonCandidate = extractJson(textBlock.text)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonCandidate)
  } catch {
    throw new Error('[onboarding] Failed to parse Claude response as JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('[onboarding] Claude response JSON was not an object')
  }

  const subreddits = normalizeSubreddits((parsed as Record<string, unknown>).subreddits)
  const keywords = normalizeKeywords((parsed as Record<string, unknown>).keywords)

  return { subreddits, keywords }
}
