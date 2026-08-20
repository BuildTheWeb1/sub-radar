-- Users table: tracks authenticated users (populated on first Google sign-in)
create table if not exists users (
  id text primary key,
  email text,
  name text,
  image text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Posts table: stores scraped Reddit posts
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  reddit_id text not null,
  title text not null,
  url text not null,
  subreddit text not null,
  author text,
  body text,
  upvotes integer default 0,
  num_comments integer default 0,
  relevance_score integer default 0,
  status text not null default 'new' check (status in ('new', 'replied', 'ignored', 'saved')),
  posted_at timestamptz not null,
  scraped_at timestamptz not null default now(),
  unique (user_id, reddit_id)
);

create index if not exists posts_user_id_idx on posts (user_id);
create index if not exists posts_status_idx on posts (status);
create index if not exists posts_subreddit_idx on posts (subreddit);
create index if not exists posts_relevance_score_idx on posts (relevance_score desc);
create index if not exists posts_posted_at_idx on posts (posted_at desc);

-- Config table: per-user scraper configuration
create table if not exists config (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  subreddits text[] not null default '{}',
  keywords text[] not null default '{}',
  product_description text,
  scrape_frequency text not null default '2h' check (scrape_frequency in ('1h', '2h', '6h', '12h')),
  min_relevance integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Replies table: optional user reply history
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  post_id uuid not null references posts (id) on delete cascade,
  reply_text text,
  replied_at timestamptz not null default now()
);

create index if not exists replies_user_id_idx on replies (user_id);
create index if not exists replies_post_id_idx on replies (post_id);

-- Scrape jobs table: tracks each cron run
create table if not exists scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  posts_found integer default 0,
  error_message text
);

create index if not exists scrape_jobs_user_id_idx on scrape_jobs (user_id);
create index if not exists scrape_jobs_started_at_idx on scrape_jobs (started_at desc);

-- Campaigns table: multi-tenant, per-user scraper campaigns (successor to config)
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null default 'Default',
  product_description text,
  subreddits text[] not null default '{}',
  keywords text[] not null default '{}',
  scrape_frequency text not null default '2h' check (scrape_frequency in ('1h', '2h', '6h', '12h')),
  min_relevance integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_user_id_idx on campaigns (user_id);

-- Chunked cron cursor columns for campaigns (used by a later phase)
alter table campaigns add column if not exists scrape_offset integer not null default 0;
alter table campaigns add column if not exists last_scraped_at timestamptz;

-- Link posts to the campaign that produced them
alter table posts add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
create index if not exists posts_campaign_id_idx on posts (campaign_id);

-- Subreddit guidelines table: cached per-subreddit self-promotion policy and
-- ban-risk classification, derived from Reddit's public about.json/rules.json.
create table if not exists subreddit_guidelines (
  subreddit text primary key,
  self_promo_policy text not null default 'unknown' check (self_promo_policy in ('allowed', 'limited', 'banned', 'unknown')),
  links_allowed boolean not null default false,
  min_karma integer,
  min_account_age_days integer,
  cadence_note text,
  risk text not null default 'unknown' check (risk in ('green', 'caution', 'strict', 'unknown')),
  rules jsonb not null default '[]',
  public_description text,
  subscribers integer,
  fetched_at timestamptz not null default now()
);

-- Live scrape progress. A scrape cycle spans several cron invocations (see
-- TIME_BUDGET_MS in lib/scraper.ts), so without these the UI cannot tell an idle
-- scraper apart from one that is halfway through a cycle. Written once per
-- subreddit x keyword pair by the cron route, read by /api/scrape-status.
alter table scrape_jobs add column if not exists campaign_id uuid references campaigns(id) on delete cascade;
alter table scrape_jobs add column if not exists pairs_total integer not null default 0;
alter table scrape_jobs add column if not exists pairs_done integer not null default 0;
alter table scrape_jobs add column if not exists current_subreddit text;
alter table scrape_jobs add column if not exists current_keyword text;

create index if not exists scrape_jobs_campaign_id_idx on scrape_jobs (campaign_id);

-- Partial index for the "is a job running right now?" lookup, which the dashboard
-- polls every few seconds while a scrape is open.
create index if not exists scrape_jobs_open_idx on scrape_jobs (user_id, started_at desc) where finished_at is null;

-- Credit-based rate limiting, and the switch from cron-chunked scraping to one
-- Workflow SDK run per scan cycle (see lib/workflows/scrape-cycle.ts).
--
-- New users start with 100 credits (trial plan) — enough for a handful of scan
-- cycles and AI calls to get a feel for the product before needing to upgrade.
-- The default lives on the column rather than in application code so it applies
-- uniformly regardless of how a user row gets created.
alter table users add column if not exists plan text not null default 'trial';
alter table users add column if not exists credit_balance integer not null default 100;
alter table users add column if not exists credits_reset_at timestamptz;

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  delta integer not null,
  reason text not null,
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_id_idx on credit_ledger (user_id, created_at desc);

-- A campaign now owns its own schedule: next_run_at replaces the cron route's
-- isCampaignDue() estimate, active_run_id tracks the in-flight workflow run (NULL
-- when idle), and paused_reason records why a cycle didn't start (e.g.
-- 'insufficient_credits') until the user resolves it.
--
-- scrape_offset and scrape_jobs.pairs_total/pairs_done are NOT dropped here: the
-- ScraperBar still reads pairs_total/pairs_done for its progress bar, and
-- scrape_offset is left in place as a safe rollback path. Both are candidates for
-- removal in a follow-up once the workflow-based scraper has run in production
-- for a full cycle.
alter table campaigns add column if not exists paused_reason text;
alter table campaigns add column if not exists active_run_id text;
alter table campaigns add column if not exists next_run_at timestamptz;

-- active_run_id represents "this campaign has a live, self-perpetuating scan
-- chain" (set once when the chain starts, cleared only when the chain stops —
-- paused or failed), which is a different question from "is a scrape actively
-- running right now" (answered by an open scrape_jobs row). Conflating the two
-- caused a bug where the chain-alive flag got cleared on every cycle-to-cycle
-- transition, letting duplicate self-perpetuating chains stack up. See
-- lib/workflows/scrape-cycle.ts.

-- Idempotency key for scan-cycle credit charges: ref_id is the charging step's
-- stable stepId (see getStepMetadata() in lib/workflows/scrape-cycle.ts), so a
-- retried step's second attempt at the same charge is a guaranteed no-op rather
-- than a double charge. Scoped to reason = 'scan_cycle' only — other reasons
-- (e.g. 'content_ideas') intentionally reuse the same ref_id across separate,
-- individually-billable calls and must not be deduplicated by this index.
create unique index if not exists credit_ledger_scan_cycle_ref_id_idx
  on credit_ledger (ref_id) where reason = 'scan_cycle';

-- Idempotency for markRunStartedStep: a retried step re-runs the same insert,
-- which would otherwise orphan a duplicate scrape_jobs row per attempt. At most
-- one open (finished_at IS NULL) job per campaign is meaningful anyway, so this
-- doubles as the arbiter for an upsert-on-retry.
create unique index if not exists scrape_jobs_open_per_campaign_idx
  on scrape_jobs (campaign_id) where finished_at is null;

-- Idempotency key for Stripe-purchased credits: ref_id is the Checkout
-- Session id (see app/api/billing/webhook/route.ts), so a redelivered webhook
-- event for the same session is a no-op instead of double-granting credits.
-- Scoped to reason = 'purchase' only, mirroring the scan_cycle index above.
create unique index if not exists credit_ledger_purchase_ref_id_idx
  on credit_ledger (ref_id) where reason = 'purchase';

-- Tombstone for deleted accounts (see app/api/account/route.ts). Google's
-- providerAccountId is stable, so without this a deleted user could just
-- sign in again and get re-inserted with the trial default credit_balance
-- (100 — see above) for free, indefinitely. lib/auth.ts's signIn callback
-- checks this table and grants 0 instead of 100 to a ONCE-deleted id
-- reappearing, closing that loop without permanently blocking a legitimate
-- return.
create table if not exists deleted_accounts (
  id text primary key,
  deleted_at timestamptz not null default now()
);

-- Reply-idea generations (the per-post "Reply idea" button, post-card.tsx) are
-- cached on the post row rather than regenerated on every page view — "session"
-- here means "the current scan cycle's set of leads", not the browser tab: a
-- reply drafted for a post should survive a refresh, but reset once a new scan
-- brings in a new batch of posts, so stale drafts don't linger under leads the
-- user has already moved past. reply_ideas is NULL until first generated; the
-- clear-on-new-scan side is a full-table UPDATE per campaign in
-- clearReplyIdeasStep (lib/workflows/scrape-cycle.ts), run at the start of
-- every cycle — chain and ad-hoc alike, since both call markRunStartedStep.
alter table posts add column if not exists reply_ideas jsonb;
