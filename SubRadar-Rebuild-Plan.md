# SubRadar Rebuild Plan

**Goal:** Strip the current single-purpose build and rebuild SubRadar into a real product that helps **founders and indie hackers "get into Reddit"** — find the right communities, understand their rules, engage without getting banned, and never miss a relevant conversation.

**Date:** 2026-07-23
**Author:** Claudiu

---

## 1. Where SubRadar is today (honest audit)

The bones are good. It's a Next.js 16 / React 19 app with Neon (serverless Postgres), NextAuth, shadcn/Tailwind v4, and a Vercel Cron scraper hitting Reddit's public `.json` API. The architecture in the original PRD is sound: cron scrapes in the background, the DB stores scored posts, the dashboard reads pre-fetched data. That part stays.

The problem is it's **hardcoded to one product (Mood Fast) and one user**, and a couple of things quietly don't work at scale. Concretely:

- **Relevance scoring is baked to a single niche.** `lib/scraper.ts` has a hardcoded `highValueTerms` array (`mood`, `mental`, `clarity`, `feel`, …). Any other product gets garbage scores. This is the single biggest thing making it "not functional" as a product.
- **Default config is Mood Fast.** `lib/defaults.ts` ships fasting/mood subreddits and keywords. A new user lands in someone else's use case.
- **Auth is single-admin, not multi-user.** Login is one `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` from env. There's no signup — it can't onboard a second person, let alone paying users.
- **The scrape can't finish inside the cron budget.** The scraper sleeps 2s between every `subreddit × keyword` request (10 subs × 20 keywords = 200 requests ≈ 6+ min), but `app/api/cron/scrape/route.ts` sets `maxDuration = 60`. On Vercel Hobby it gets killed mid-run. This is a real functional bug, not just a limitation.
- **Dead weight in the repo.** `reddit_scraper.py` (the old Python version), `reddit_results.json` (893 KB test dump), and `proxy.ts` are leftovers to remove.
- **Scoring is keyword-frequency only.** Even generalized, counting keyword hits is noisy. Founders will judge the product on whether the top posts are actually worth replying to.

What's genuinely reusable: the DB schema shape (posts / config / replies / scrape_jobs), the cron+dashboard architecture, the feed/saved/history UI, the status panel, and the safe-subreddit validation already in the scraper.

---

## 2. The product thesis: "Reddit for founders, without the ban"

Founders know Reddit converts but are scared of it — one wrong self-promo comment gets the account shadowbanned, and every subreddit has different unwritten rules. SubRadar's job is to remove that fear and the manual grind. The product is defined by **four pillars**:

1. **Find relevant posts to comment on and pitch a product.** Monitor the right subreddits and surface the conversations where the user can genuinely help — and mention their product naturally. (The current scraper core, generalized and made relevance-smart.)
2. **Structured, per-subreddit guidelines so you don't get banned.** For every subreddit found, give the user a clear, structured brief: self-promotion policy, link rules, karma/account-age requirements, posting cadence norms, and a ban-risk rating — so they comment safely.
3. **Scheduled monitoring.** Scraping runs automatically on a schedule the user sets, so opportunities show up in the feed without anyone pressing a button.
4. **Turn results into content ideas.** The same discovered threads become raw material for the user's *own* content — mining hooks, angles, and pain points into ready-to-write LinkedIn/Twitter post ideas.

The current build only does a hardcoded version of pillar #1. The rebuild generalizes #1 and adds #2, #3 (as a real feature), and #4 — that's the difference between "a scraper I made" and "a product founders pay for."

---

## 3. Phase 0 — Strip (0.5 day)

Remove the single-purpose and dead code so the rebuild starts clean.

- Delete `reddit_scraper.py`, `reddit_results.json`, `proxy.ts`, and the stale `vercel.json` if unused.
- Gut the hardcoded `highValueTerms` from `lib/scraper.ts` (scoring is replaced in Phase 2).
- Empty `lib/defaults.ts` — new users get an empty config filled by onboarding, not Mood Fast.
- Rip out the single-admin auth path in `lib/auth.ts` (keep NextAuth, replace the credentials-admin flow in Phase 1).
- Keep: the schema, cron route structure, scraper's HTTP + rate-limit + `SUBREDDIT_RE` validation, and all the feed/settings UI components.

**Exit criteria:** app builds, no Mood Fast strings anywhere, no Python/test artifacts, scoring temporarily returns a neutral value.

---

## 4. Phase 1 — Make it multi-user and product-agnostic (2–3 days)

This turns it from "my personal tool" into "an app people can sign up for."

**Auth & accounts.** Replace admin-credentials with real signup. Simplest path that fits the stack: NextAuth Google OAuth. Every user gets their own campaign and their own `posts`, with all DB access scoped by `user_id` server-side (the Neon connection is only ever used from server code — no data is exposed to the client directly).

**Campaigns instead of one global config.** Introduce a `campaigns` table (a founder may run more than one product, and it makes the data model honest):

```
campaigns (id, user_id, name, product_description, subreddits[], keywords[],
           scrape_frequency, min_relevance, created_at)
posts.campaign_id  → references campaigns(id)   -- add column
```

Start with one campaign per user in the UI; the table makes multi-campaign a config change later, not a migration.

**Fix the cron timeout properly.** Two viable options — pick one:
- *Chunked cron (recommended, no new infra):* store scrape progress per campaign and process a slice of `subreddit × keyword` pairs per invocation, resuming next run. Fits Vercel Hobby's 60s ceiling.
- *Queue-based:* push each subreddit fetch as a job (e.g. a Postgres table as a queue or Upstash QStash) and drain it. More robust, slightly more infra.

**Exit criteria:** a brand-new Google account can sign up, create a campaign, and see it scrape end-to-end without hitting a timeout.

---

## 5. Phase 2 — The four pillars (the actual product) (5–7 days)

These are what make it worth paying for. Each maps to one of the four pillars from Section 2.

### 5.0 Product-description onboarding (enables Pillar 1)
The first-run experience that makes everything else work. User pastes a one-paragraph product description; an LLM (Claude Haiku — cheap, already in the PRD) returns:
- **Suggested subreddits** where that product's audience lives, with a one-line reason each.
- **Suggested keywords / phrases** real users would actually write (not marketing terms).

The user accepts/edits, and the campaign is configured in 60 seconds instead of by hand. Best demo moment; also the input that feeds relevance scoring and content ideas.

### 5.1 Pillar 1 — Relevant posts to comment on & pitch — ⏸️ DEFERRED
**Status (2026-07-23): deferred.** The app ships with the existing keyword-frequency scoring for now; semantic/LLM relevance scoring is parked for a later pass. The design below is retained as the plan for when it's picked up.

Replace keyword-frequency counting with meaning-based scoring so the top of the feed is actually worth the founder's time:
- *Cheap tier:* embed the product description once, embed each post, score by cosine similarity. No per-post LLM cost.
- *Precision tier:* for posts above a similarity threshold, ask Haiku "is this someone SubRadar's user could genuinely help, and how?" → 0–100 + a one-line "why this post" reason on the card.

Each post card links to Reddit, shows the relevance score + reason, and (optional add-on) a **helpful-first draft reply** the user edits and posts manually. Never auto-post — that's the fastest way to a ban, kept out of scope.

### 5.2 Pillar 2 — Structured per-subreddit guidelines (the differentiator)
For every subreddit in a campaign, fetch `/about.json` + `/about/rules.json` and render a **structured brief** the user reads before commenting:
- Self-promotion policy (allowed / limited / banned) and the relevant rule text
- Whether links are allowed in comments/posts
- Minimum karma and account-age requirements
- Posting cadence / "don't spam" norms
- A single **ban-risk badge** — Green / Caution / Strict — shown on every post card and in settings

This is the pillar no competitor does well, and it's exactly the fear that keeps founders off Reddit. Cache per subreddit; refresh periodically.

### 5.3 Pillar 3 — Scheduled monitoring
Turn the existing Vercel Cron scrape into a real, user-facing scheduling feature: the user picks a cadence (1h/2h/6h/12h) per campaign, sees "last scrape / next scrape / new since last visit," and can still trigger a manual run. Combined with the chunked-cron fix from Phase 1 so scrapes actually finish. Optional: a scheduled **email digest** of the top opportunities (Resend free tier).

### 5.4 Pillar 4 — Results → content ideas
A dedicated view that flips the same discovered threads from "places to pitch" into "things to write about." For a selected set of high-signal posts, Haiku extracts:
- Recurring **pain points / questions** the niche keeps raising
- **Hooks and angles** for the user's own LinkedIn/Twitter posts
- A short list of **draft post ideas** with a one-line rationale each

This directly serves the personal-brand use case (an engineer sharing what a niche is actually struggling with), and reuses data the app already collected — near-zero extra scraping cost.

**Exit criteria:** from "paste product description," a founder gets (1) a scored feed of posts to engage, (2) a structured safety brief per subreddit, (3) automatic refreshes on a schedule, and (4) a content-ideas view derived from the same results.

---

## 6. Phase 3 — Ship & position (1–2 days)

- **Deploy** on Vercel; if daily cron on Hobby is too limiting, use a free external cron (cron-job.org) hitting the protected endpoint, or Vercel Pro.
- **Free vs paid split** (light, since positioning isn't the focus of this doc): Free = 1 campaign, 3 subreddits, keyword scoring, manual scrape. Paid (~$19/mo) = multiple campaigns, unlimited subreddits, semantic scoring, AI reply drafts, rules panel, email digests.
- **Personal-brand tie-in:** the rebuild is itself content. "I rebuilt my dead side project into a real product — here's the architecture" is a strong LinkedIn thread that fits your practitioner positioning (build-in-public, show the code).

---

## 7. Suggested build order & effort

| Phase | Work | Effort |
|---|---|---|
| 0 | Strip single-purpose + dead code | 0.5 day |
| 1 | Multi-user auth, campaigns table, RLS, fix cron timeout | 2–3 days |
| 2.0 | Product-description onboarding (LLM subreddit/keyword suggest) | 1 day |
| 2.1 | Pillar 1 — semantic relevance scoring + feed (+ optional draft reply) — **DEFERRED** (keyword scoring ships instead) | — |
| 2.2 | Pillar 2 — structured per-subreddit guidelines + ban-risk badge | 1 day |
| 2.3 | Pillar 3 — user-facing scheduled monitoring (+ optional digest) | 0.5–1 day |
| 2.4 | Pillar 4 — results → content ideas view | 1 day |
| 3 | Deploy, free/paid gating, launch content | 1–2 days |
| | **Total** | **~8.5–11.5 days** |

Ship Phases 0–1 + onboarding (2.0) as the first usable version — a real, differentiated product running on keyword scoring (Pillar 1 semantic scoring deferred). Pillars 2–4 layer on next.

---

## 8. Key technical decisions to lock before building

- **Auth provider:** Google OAuth via NextAuth (already wired, JWT sessions). Recommend keeping NextAuth Google.
- **Cron strategy:** chunked-resume vs. queue. Recommend chunked-resume first (no new infra), revisit if scrape volume grows.
- **LLM:** Claude Haiku for onboarding suggestions, scoring precision tier, and reply drafts — cheap enough that per-user cost is negligible.
- **Embeddings source** for semantic scoring (an embeddings API vs. keyword-only fallback for free tier).

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Reddit rate-limits / blocks unauthenticated `.json` scraping | Keep the 2s delay + real User-Agent; consider Reddit OAuth app (free, higher limits) once multi-user |
| LLM cost scales with users | Cache embeddings; gate the precision/reply-draft tiers behind paid |
| Users still get banned and blame the tool | Position as "reduce risk," surface rules, never auto-post, add cadence warnings |
| Reddit changes `.json` / rules endpoints | Scraper + rules fetch isolated in single modules, easy to patch |
| Scope creep on v1 | Ship 0–1 + 2.1 first; treat 2.2–2.5 as the paid follow-up |

---

## 10. What stays out of scope

Auto-posting replies, tracking upvotes on your own comments, non-Reddit platforms (Twitter/X, HN), team/multi-seat, and a mobile app. All defensible later; none needed to prove the product.
