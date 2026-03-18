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
