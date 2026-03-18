# SubRadar — Product Requirements Document

**Version:** 1.0
**Date:** 2026-03-18
**Status:** Draft

---

## 1. Overview

SubRadar is a Reddit monitoring and engagement tool for indie makers, founders, and marketers. It continuously scans relevant subreddits for conversations where a product could be mentioned naturally — and surfaces them in a clean dashboard so you can engage at the right moment.

The first use case is Mood Fast, but the tool is product-agnostic and could be used for any app, SaaS, or brand.

---

## 2. Problem

Reddit is one of the highest-converting channels for indie products — but finding the right posts to engage with is tedious and time-consuming:

- Manually checking 8+ subreddits across 10+ keywords daily is not sustainable
- Reddit's API now requires manual approval, blocking most automation tools
- Posting generic promotional comments gets accounts banned
- There's no good free tool for small-scale, personal use

**SubRadar solves this by doing the monitoring automatically and surfacing only the most relevant opportunities.**

---

## 3. Target Users

- **Primary:** Indie makers / solo founders promoting a product on Reddit
- **Secondary:** Small marketing teams at early-stage startups
- **Not:** Agencies running mass Reddit spam campaigns (against Reddit ToS)

---

## 4. Core Concept

```
[Vercel Cron Job — every 2 hours]
        ↓
[Scraper: Reddit public .json API]
        ↓
[Relevance scoring engine]
        ↓
[Database: store posts + scores]
        ↓
[Next.js Dashboard: review, draft, track]
        ↓
[User manually posts reply on Reddit]
```

The scraper runs in the **background on a schedule** — not on-demand. This sidesteps Vercel's function timeout issue entirely. The UI just reads pre-fetched data from a database.

---

## 5. Technical Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Fast, Vercel-native |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development |
| Backend | Next.js API Routes (TypeScript) | No Python runtime needed on Vercel |
| Scraper | Rewritten in TypeScript | Reddit's API is plain HTTP — no Python libs required |
| Cron Jobs | Vercel Cron | Built-in, no extra service |
| Database | Supabase (Postgres) | Free tier, easy setup, real-time capable |
| Auth | Clerk or NextAuth | Simple user sessions |
| AI replies (v2) | Claude API (claude-haiku-4-5) | Fast + cheap for reply drafts |
| Hosting | Vercel | One-click deploy |

### Why rewrite the scraper in TypeScript?

The Python script makes plain HTTP requests to `reddit.com/*.json` — no Python-specific libraries are needed. Rewriting it in TypeScript means:
- No Python runtime complexity on Vercel
- Single language across the whole stack
- Runs natively in Vercel Cron (Node.js)

### Solving the timeout problem

The scraper takes ~5 minutes due to rate limiting (2s between each request). On Vercel:
- **Do NOT run scraper on-demand** (would timeout)
- **Instead:** Vercel Cron triggers a scrape every 2 hours
- The cron job runs through subreddits/keywords over time, writing results to Supabase
- The dashboard reads from Supabase — instant load, no waiting

---

## 6. Features

### MVP (v1)

#### 6.1 Dashboard — Post Feed

The main view. A filterable, sortable list of Reddit posts found by the scraper.

Each post card shows:
- Post title (linked to Reddit)
- Subreddit badge
- Relevance score (0–100)
- Reddit upvote count + comment count
- Date posted
- Post body preview (first 200 chars)
- Status badge: `New` / `Replied` / `Ignored` / `Saved`

**Actions per post:**
- Mark as `Replied` — removes from main feed, moves to history
- Mark as `Ignored` — hides it permanently
- `Save` — bookmark for later
- `Open on Reddit` — opens the actual post in a new tab

**Filters:**
- By subreddit
- By status (New / Saved / All)
- By date range
- By minimum relevance score (slider: 0–100)

**Sort options:**
- Relevance score (default)
- Most upvoted
- Most commented
- Most recent

---

#### 6.2 Configuration — Keywords & Subreddits

A settings page where the user defines what to monitor.

**Subreddits list** — add/remove subreddits to watch
**Keywords list** — add/remove search keywords
**Product description** — a short blurb about the product (used later for AI reply context)
**Scrape frequency** — every 1h / 2h / 6h / 12h
**Min relevance threshold** — only store posts above this score (reduces noise)

Default config pre-filled for Mood Fast:
```
Subreddits: intermittentfasting, fasting, OMAD, moodtracking, mentalhealth, selfimprovement, loseit
Keywords: mood, mental clarity, brain fog, track mood, fasting benefits, mood swings, emotional eating
```

---

#### 6.3 Scrape Status Panel

Small panel (sidebar or top bar) showing:
- Last scrape: `2 hours ago`
- Next scrape: `in 1 hour`
- Posts found this week: `143`
- New unreviewed posts: `12`
- Manual trigger button: `Run now` (for testing — rate limited to once per 10 min)

---

#### 6.4 History / Replied Tracker

A separate tab showing all posts you marked as `Replied`, with:
- The post title + link
- Date you marked it replied
- Optional: your reply text (manual text field to paste what you wrote)

Purpose: prevents double-replying the same post, and gives you a record of your Reddit activity.

---

#### 6.5 Basic Auth

Simple login (email + password or Google OAuth via Clerk/NextAuth).
Single-user MVP — no team features needed yet.

---

### V2 Features (post-MVP)

#### 6.6 AI Reply Drafts

On each post card, a `Draft Reply` button generates a suggested reply using Claude or GPT.

The prompt uses:
- Post title + body
- Your product description from config
- A system instruction to be helpful first, promotional second, and never spammy

Output: a 3–5 sentence reply suggestion. User edits and posts manually.

**Cost estimate:** claude-haiku-4-5 at ~$0.001/reply → negligible for personal use.

---

#### 6.7 Email Digest

Daily or real-time email alert when a post scores above a threshold (e.g., 80+/100).

- Daily digest: top 5 posts from the last 24h
- Real-time alert: only for scores 90+
- Via Resend (free tier: 3,000 emails/month)

---

#### 6.8 Multi-Campaign Support

Allow the user to create multiple "campaigns" — each with its own subreddits, keywords, and product description. Useful if the user has more than one product.

---

#### 6.9 Analytics

Simple stats page:
- Posts found per day (line chart)
- Top performing subreddits (bar chart)
- Engagement rate: replied / total found
- Keyword hit frequency

---

## 7. Pages / Routes

```
/                    → Redirect to /dashboard
/login               → Auth page
/dashboard           → Main post feed (default: New posts)
/dashboard/saved     → Saved posts
/dashboard/history   → Replied posts history
/settings            → Keywords, subreddits, scrape config
/settings/account    → User account
/api/cron/scrape     → Internal — Vercel Cron endpoint (protected)
/api/posts           → GET posts from DB with filters
/api/posts/[id]      → PATCH post status (replied/ignored/saved)
/api/scrape/trigger  → POST — manual scrape trigger (rate limited)
```

---

## 8. Data Model (Supabase)

```sql
-- Posts found by the scraper
posts (
  id            uuid primary key,
  reddit_id     text unique,       -- Reddit's own post ID (deduplication)
  title         text,
  url           text,
  subreddit     text,
  reddit_score  int,
  num_comments  int,
  body_preview  text,
  relevance     int,               -- 0–100
  posted_at     timestamptz,
  scraped_at    timestamptz,
  status        text default 'new' -- new | replied | ignored | saved
)

-- User config
config (
  id            uuid primary key,
  user_id       text,
  subreddits    text[],
  keywords      text[],
  product_desc  text,
  scrape_every  int,               -- hours
  min_relevance int default 20
)

-- Reply history
replies (
  id            uuid primary key,
  post_id       uuid references posts(id),
  reply_text    text,              -- optional, user pastes their reply
  replied_at    timestamptz
)
```

---

## 9. MVP Scope & Build Order

| Phase | What to build | Estimated effort |
|---|---|---|
| 1 | Supabase setup + scraper rewritten in TypeScript | 1 day |
| 2 | Vercel Cron job running the scraper | half day |
| 3 | Dashboard — post feed, filters, status actions | 2 days |
| 4 | Settings page — keywords/subreddits config | 1 day |
| 5 | Auth (Clerk — 30 min setup) | half day |
| 6 | Deploy to Vercel | half day |
| **Total MVP** | | **~5–6 days** |

---

## 10. Out of Scope (v1)

- Auto-posting replies (against Reddit ToS, high ban risk)
- Tracking reply performance (upvotes on your comments)
- Competitor monitoring
- Twitter/X or other platforms
- Team/multi-user support
- Mobile app

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Reddit blocks unauthenticated scraping | Rotate User-Agent strings, respect 2s delay, scrape slowly |
| Reddit changes .json endpoint structure | Scraper breaks — isolate in one module, easy to fix |
| Vercel Cron free tier (1 job/day on Hobby) | Use Vercel Pro ($20/mo) or use a free external cron (cron-job.org) to hit the API endpoint |
| Posts go stale before user sees them | Sort by `scraped_at` desc, surface newest first |
| Low relevance score quality | Improve scoring with TF-IDF or simple ML later — fine for MVP |

---

## 12. Success Metrics (for personal use)

- Finds 5+ genuinely relevant posts per day
- < 20% false positive rate (posts that aren't actually relevant)
- Takes < 5 min/day to review and engage
- Account not banned after 30 days of use

---

## 13. Future Vision

SubRadar could evolve into a general-purpose Reddit monitoring SaaS for indie makers — with a free tier (1 campaign, 3 subreddits) and a paid tier ($19/mo, unlimited). The architecture already supports it.
