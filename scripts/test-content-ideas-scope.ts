/**
 * Regression test for the Content Ideas scoping bug: retargeting a campaign
 * (changing subreddits/keywords) used to leave old, often high-upvote posts
 * from the abandoned subreddits eligible for "top posts by upvotes" mining
 * forever, since they share the same campaign_id. Content Ideas would then
 * surface pain points from a completely different niche than what Radar/Leads
 * currently show.
 *
 * This exercises the real production function (getContentIdeasSourcePosts in
 * lib/content-ideas.ts) against a real Postgres instance — not a re-implemented
 * copy of its SQL — so it can't silently drift from what the API route
 * actually runs.
 *
 * Run against a disposable database only (a Neon branch, or a local/dev DB).
 * It seeds a synthetic user/campaign/posts, asserts, and deletes everything it
 * inserted in a `finally` block, but do not point this at a database whose
 * data you can't afford to touch even briefly.
 *
 *   DATABASE_URL="postgres://…disposable-branch…" npx tsx scripts/test-content-ideas-scope.ts
 */
import { randomUUID } from 'node:crypto'
import { sql } from '../lib/db'
import { getContentIdeasSourcePosts } from '../lib/content-ideas'

const userId = `test-user-${randomUUID()}`
const campaignId = randomUUID()

const CURRENT_SUBREDDIT = 'currentniche'
const STALE_SUBREDDIT = 'abandonedniche'

let failures = 0

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ok — ${label}`)
  } else {
    failures++
    console.log(`  FAIL — ${label}`)
  }
}

async function insertPost(opts: {
  redditId: string
  subreddit: string
  upvotes: number
  relevanceScore: number
  title: string
}) {
  await sql`
    INSERT INTO posts (
      user_id, campaign_id, reddit_id, title, url, subreddit, upvotes,
      relevance_score, posted_at
    ) VALUES (
      ${userId}, ${campaignId}, ${opts.redditId}, ${opts.title},
      ${'https://reddit.com/r/' + opts.subreddit + '/' + opts.redditId},
      ${opts.subreddit}, ${opts.upvotes}, ${opts.relevanceScore}, now()
    )
  `
}

async function main() {
  console.log(`Seeding against ${new URL(process.env.DATABASE_URL!).host} — user ${userId}`)

  await sql`
    INSERT INTO campaigns (id, user_id, name, subreddits, keywords, product_description)
    VALUES (
      ${campaignId}, ${userId}, 'Test campaign',
      ${[CURRENT_SUBREDDIT]}::text[], ${['widget']}::text[],
      'A widget for testing'
    )
  `

  // Stale: high upvotes, but from a subreddit no longer in campaign.subreddits.
  // This is exactly the shape of the real bug — old posts from an abandoned
  // niche outranking today's actual leads on upvotes alone.
  await insertPost({
    redditId: 'stale-1',
    subreddit: STALE_SUBREDDIT,
    upvotes: 9999,
    relevanceScore: 0,
    title: 'STALE: should never appear — wrong subreddit',
  })
  await insertPost({
    redditId: 'stale-2',
    subreddit: STALE_SUBREDDIT,
    upvotes: 5000,
    relevanceScore: 100,
    title: 'STALE: should never appear — wrong subreddit, even with high relevance',
  })

  // Current subreddit, but below the relevance floor (no verbatim keyword
  // match) — should also be excluded, same as Leads' default view.
  await insertPost({
    redditId: 'low-relevance',
    subreddit: CURRENT_SUBREDDIT,
    upvotes: 500,
    relevanceScore: 0,
    title: 'LOW RELEVANCE: should never appear — below relevance floor',
  })

  // Valid: current subreddit, meets the relevance floor.
  await insertPost({
    redditId: 'valid-1',
    subreddit: CURRENT_SUBREDDIT,
    upvotes: 10,
    relevanceScore: 20,
    title: 'VALID: should appear, ranked second (lower upvotes)',
  })
  await insertPost({
    redditId: 'valid-2',
    subreddit: CURRENT_SUBREDDIT,
    upvotes: 50,
    relevanceScore: 40,
    title: 'VALID: should appear, ranked first (higher upvotes)',
  })

  const campaign = { id: campaignId, subreddits: [CURRENT_SUBREDDIT] }
  const result = await getContentIdeasSourcePosts(userId, campaign, 20)

  console.log(`\ngetContentIdeasSourcePosts returned ${result.length} post(s):`)
  for (const p of result) console.log(`  - ${p.title}`)
  console.log()

  check('returns exactly the 2 valid posts', result.length === 2)
  check(
    'no stale-subreddit post leaked through',
    !result.some((p) => p.subreddit === STALE_SUBREDDIT)
  )
  check(
    'no below-relevance-floor post leaked through',
    !result.some((p) => p.title.startsWith('LOW RELEVANCE'))
  )
  check(
    'every returned post is from the current subreddit',
    result.every((p) => p.subreddit === CURRENT_SUBREDDIT)
  )
  check(
    'ordered by upvotes desc (higher-upvote valid post first)',
    result[0]?.title.includes('ranked first') && result[1]?.title.includes('ranked second')
  )
}

main()
  .catch((err) => {
    console.error('Test run crashed:', err)
    failures++
  })
  .finally(async () => {
    await sql`DELETE FROM posts WHERE campaign_id = ${campaignId}`
    await sql`DELETE FROM campaigns WHERE id = ${campaignId}`
    console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} check(s) failed)`)
    process.exit(failures === 0 ? 0 : 1)
  })
