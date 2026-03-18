---
name: SubRadar Project Overview
description: Core project goals, target users, technical stack, and MVP scope
type: project
---

# SubRadar Project Overview

**Project Goal:** Build a Reddit monitoring and engagement tool for indie makers to find relevant conversations and surface high-quality engagement opportunities automatically.

**Target Users:** Solo founders / indie makers promoting a product (primary). Early-stage startup marketing teams (secondary).

**First Product:** Mood Fast (mood tracking + fasting app) — pre-loaded config included in MVP.

**Tech Stack (Vercel-native, TypeScript across the board):**
- Frontend: Next.js 15 (App Router)
- Styling: Tailwind CSS + shadcn/ui
- Backend: Next.js API Routes (TypeScript)
- Scraper: TypeScript (rewritten from Python — no Python runtime on Vercel)
- Cron Jobs: Vercel Cron (every 2 hours)
- Database: Supabase (Postgres)
- Auth: Clerk or NextAuth
- Hosting: Vercel (one-click deploy)

**Key Architectural Decision:** Scraper runs on a background schedule (Vercel Cron every 2 hours), not on-demand, to avoid timeout issues. Dashboard reads from pre-fetched data in Supabase — instant load.

**MVP Timeline:** ~5-6 days (per PRD estimate)

**Success Criteria (personal use):**
- Finds 5+ genuinely relevant posts per day
- < 20% false positive rate
- Takes < 5 min/day to review and engage
- Account not banned after 30 days

**Future Vision:** Freemium SaaS (free tier: 1 campaign, 3 subreddits; paid tier: $19/mo unlimited) once MVP proven with Mood Fast.

**Major Risks:**
1. Reddit blocks unauthenticated scraping (mitigation: rotate User-Agents, respect rate limits)
2. Vercel Cron free tier limited (1 job/day on Hobby) — need Pro ($20/mo) or external cron
3. Relevance scoring accuracy (fine for MVP, improve later with TF-IDF or ML)
