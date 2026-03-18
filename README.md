# Sub-Radar

A Reddit monitoring tool for product teams and marketers. Automatically scrapes Reddit for posts matching your configured keywords and subreddits, scores them for relevance, and surfaces the ones worth engaging with.

## What it does

Instead of manually checking dozens of subreddits, Sub-Radar pulls relevant posts into one feed, prioritizes them by relevance, and tracks your engagement — so you never miss an opportunity or double-reply.

## Features

- **Post Discovery** — Scrapes Reddit posts from configured subreddits on a schedule (1h, 2h, 6h, or 12h), or trigger manually on demand
- **Relevance Scoring** — Posts are scored 0–100 based on keyword matches so you see the highest-value discussions first
- **Engagement Tracking** — Mark posts as replied, ignored, or saved to stay organized
- **Feed Views** — Separate tabs for new posts, saved bookmarks, and replied history
- **Filtering & Sorting** — Filter by minimum relevance score, sort by relevance, upvotes, comments, or recency
- **Settings** — Configure up to 10 subreddits, 20 keywords, scrape frequency, and relevance threshold

## Typical Use Case

A health/wellness product team monitoring conversations about fasting, mental clarity, or mood across subreddits like r/intermittentfasting or r/mentalhealth — identifying posts where their product might be genuinely helpful to mention.

## Workflow

1. **Configure** — Set your subreddits, keywords, and scrape frequency in Settings
2. **Monitor** — Posts appear in your feed sorted by relevance score
3. **Engage** — Reply on Reddit, then mark the post as replied to track it
4. **Review** — Revisit saved or replied posts in their respective tabs

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Database**: Supabase (PostgreSQL)
- **Auth**: NextAuth.js (credentials provider)
- **UI**: shadcn/ui, Tailwind CSS v4
- **Deployment**: Vercel (with Cron for scheduled scraping)

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:
   ```bash
   cp .env.example .env.local
   ```

3. Configure the required environment variables:

   | Variable | Description |
   |----------|-------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
   | `NEXTAUTH_SECRET` | Random secret for NextAuth |
   | `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
   | `ADMIN_EMAIL` | Email used to log in |
   | `ADMIN_PASSWORD_HASH` | bcrypt hash of your password |
   | `CRON_SECRET` | Secret to authenticate cron requests |
   | `DEFAULT_USER_ID` | Default user ID for data scoping |

4. Generate a bcrypt password hash:
   ```bash
   node -e "require('bcryptjs').hash('yourpassword', 10).then(console.log)"
   ```

   > **Important:** In `.env.local`, escape `$` signs in the hash with `\$` to prevent Next.js from interpreting them as variable references.
   >
   > Example: `ADMIN_PASSWORD_HASH=\$2b\$10\$...`

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and log in with your configured email and password.
