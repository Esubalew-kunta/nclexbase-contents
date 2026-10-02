-- NCLEXBase Telegram scheduling schema.
-- Canonical content + scheduled posts + a single recurring publisher, per
-- the "one recurring scheduler, not one cron per question" requirement.

create extension if not exists pgcrypto;  -- gen_random_uuid()
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- Canonical content. Imported JSON questions are saved here once so a
-- scheduled post can reference stable content instead of re-uploading JSON
-- every time, and so the calendar can offer "unposted fresh questions".
-- ---------------------------------------------------------------------
create table if not exists nclex_questions (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  type text not null,
  category text,
  instructions text,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answers text[] not null default '{}',
  correct_answer_text text,
  explanation text,
  option_rationales jsonb not null default '{}'::jsonb,
  key_point text,
  notes text,
  format text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lets re-importing the same JSON update the existing row instead of
-- duplicating it, when the source JSON gives each question a stable "id".
-- A plain (non-partial) unique index is required so PostgREST's upsert
-- ON CONFLICT (external_id) can target it; Postgres unique indexes already
-- treat NULLs as distinct from each other, so rows with no external_id
-- never collide.
create unique index if not exists idx_nclex_questions_external_id on nclex_questions (external_id);

alter table nclex_questions enable row level security;

-- ---------------------------------------------------------------------
-- Scheduled Telegram posts.
-- ---------------------------------------------------------------------
do $$ begin
  create type telegram_post_status as enum ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists telegram_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references nclex_questions(id) on delete restrict,
  -- Frozen copy of the question at schedule time, so editing the source
  -- content later never silently changes an already-scheduled post.
  content_snapshot jsonb not null,
  telegram_channel text not null,
  scheduled_at timestamptz not null,
  timezone text not null,
  status telegram_post_status not null default 'scheduled',
  telegram_message_id bigint,
  telegram_poll_id text,
  telegram_followup_message_id bigint,
  published_at timestamptz,
  error_message text,
  attempt_count int not null default 0,
  -- pg_net is async: a request returns an id immediately and the real
  -- response shows up later in net._http_response. These columns let the
  -- publisher's second phase reconcile that response back to this row.
  net_request_id bigint,
  publishing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_telegram_posts_due on telegram_scheduled_posts (status, scheduled_at);
create index if not exists idx_telegram_posts_content on telegram_scheduled_posts (content_id);

alter table telegram_scheduled_posts enable row level security;
-- No policies are added: only the service_role key (which bypasses RLS)
-- may touch these tables. The app never uses the anon key for them.

-- ---------------------------------------------------------------------
-- Single-row scheduler settings (spec section 4/27): the default daily
-- publishing time + timezone every new schedule starts from.
-- ---------------------------------------------------------------------
create table if not exists telegram_settings (
  id boolean primary key default true check (id),  -- enforces exactly one row
  enabled boolean not null default true,
  daily_time text not null default '09:00',
  timezone text not null default 'UTC',
  post_followup boolean not null default true,
  channel text,
  updated_at timestamptz not null default now()
);
insert into telegram_settings (id) values (true) on conflict (id) do nothing;

alter table telegram_settings enable row level security;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_nclex_questions_updated_at on nclex_questions;
create trigger trg_nclex_questions_updated_at before update on nclex_questions
  for each row execute function set_updated_at();

drop trigger if exists trg_telegram_posts_updated_at on telegram_scheduled_posts;
create trigger trg_telegram_posts_updated_at before update on telegram_scheduled_posts
  for each row execute function set_updated_at();

drop trigger if exists trg_telegram_settings_updated_at on telegram_settings;
create trigger trg_telegram_settings_updated_at before update on telegram_settings
  for each row execute function set_updated_at();
