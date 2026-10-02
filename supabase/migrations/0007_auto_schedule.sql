-- Auto-scheduling: when a new question lands in the bank, the app fills the
-- next free Telegram slot itself instead of waiting for the admin to open the
-- calendar. Off by default for existing installs? No — the whole point is that
-- new questions get placed automatically, so this defaults to on and the admin
-- can turn it off.
alter table telegram_settings
  add column if not exists auto_schedule boolean not null default true;

-- Which slot of the day a post occupies. Recorded explicitly so a post stays
-- tied to its 09:00/21:00 slot even if the admin later edits post_times, and so
-- the calendar can render "slot 1 of 2 taken" without re-deriving anything.
alter table telegram_scheduled_posts
  add column if not exists slot_index int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_posts_slot_index') then
    alter table telegram_scheduled_posts
      add constraint telegram_posts_slot_index
      check (slot_index is null or slot_index >= 0);
  end if;
end $$;

-- Auto-assign walks forward looking for a day that still has a free slot. This
-- index is what that walk hits on every candidate day.
create index if not exists idx_telegram_posts_channel_day
  on telegram_scheduled_posts (telegram_channel, scheduled_at)
  where status in ('scheduled', 'publishing', 'published');
