-- Three changes, all in service of one product change: both of a day's
-- questions now go out at ONE time, instead of each slot having its own time.
--
-- 1. POSTS_PER_DAY BECAME ITS OWN SETTING. It used to be implied by the length
--    of post_times ("two times a day"), which only worked while every post had
--    a distinct time-of-day. With one shared time the array length can no longer
--    express the count, so it is a real column. post_times stays (collapsed to a
--    single entry) rather than being dropped: the app reads the first entry as
--    the daily time, and leaving the column alone avoids a destructive rewrite
--    for no benefit.
--
-- 2. THE FOLLOW-UP MESSAGE IS GONE. It was a separate channel post, so every
--    follower could read the answer reasoning BEFORE voting on the poll. The
--    only reason that content needed a second message at all was the 200-char
--    cap on the poll's native lamp field. We now accept dropping the overflow,
--    so the lamp carries the explanation and nothing is published afterwards.
--
-- 3. SWAP_SLOT_CONTENT. Picking a different question on the calendar used to
--    overwrite the slot in place, which silently orphaned the question that was
--    there before. Swapping two days' questions needs both rows written
--    together or the calendar is left half-swapped, so it is one function and
--    therefore one transaction.

-- ------------------------------------------------------------- posts_per_day

alter table telegram_settings
  add column if not exists posts_per_day int not null default 2;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_settings_posts_per_day') then
    alter table telegram_settings
      add constraint telegram_settings_posts_per_day
      check (posts_per_day between 1 and 6);
  end if;
end $$;

-- Collapse an existing multi-time schedule down to a single daily time. The
-- earliest slot is kept as the posting time (it is the one the admin set first,
-- and the one they see quoted on existing posts), and posts_per_day is seeded
-- from the old array length so the number of posts already on the calendar is
-- still legal. Doing this explicitly means no scheduled post silently exceeds
-- the new capacity and becomes un-editable.
update telegram_settings
   set posts_per_day = greatest(1, coalesce(array_length(post_times, 1), 1)),
       post_times = array[(post_times[1])]
 where id = true
   and array_length(post_times, 1) is not null
   and array_length(post_times, 1) > 1;

-- -------------------------------------------------------- swap_slot_content

-- Swaps the question occupying two slots, keeping both posts' dates, times and
-- timezones exactly where they are. The caller supplies the already-built
-- snapshots for both sides so the payload stays frozen per post and is derived
-- from the same builders the preview uses.
create or replace function swap_slot_content(
  p_post_a uuid,
  p_post_b uuid,
  p_content_a uuid,
  p_snapshot_a jsonb,
  p_content_b uuid,
  p_snapshot_b jsonb
) returns void as $$
begin
  -- A no-op when both arguments name the same post: writing it twice would
  -- still be correct, but it means the caller thought it had two slots when it
  -- had one, and silently succeeding hides that.
  if p_post_a is null or p_post_b is null or p_post_a = p_post_b then
    raise exception 'swap_slot_content requires two distinct posts';
  end if;

  update telegram_scheduled_posts
     set content_id = p_content_a,
         content_snapshot = p_snapshot_a
   where id = p_post_a;

  update telegram_scheduled_posts
     set content_id = p_content_b,
         content_snapshot = p_snapshot_b
   where id = p_post_b;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------- the publisher

-- Same two-phase reconcile shape as 0004, minus the follow-up phase and the
-- columns that only existed to track it.
create or replace function telegram_publisher_tick() returns void as $$
declare
  bot_token text;
  rec record;
  claim record;
  body jsonb;
  payload jsonb;
begin
  select decrypted_secret into bot_token from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if bot_token is null then
    raise warning 'telegram_publisher_tick: telegram_bot_token not set in Vault, skipping this tick';
    return;
  end if;

  -- Phase 1: reconcile the quiz poll. pg_net has no synchronous "wait for
  -- response" call, so the previous tick claimed the row, fired, and stored
  -- net_request_id; this tick matches that against the async response.
  for rec in
    select tsp.id, tsp.attempt_count, tsp.telegram_channel, tsp.content_snapshot, r.status_code, r.content
    from telegram_scheduled_posts tsp
    join net._http_response r on r.id = tsp.net_request_id
    where tsp.status = 'publishing'
  loop
    begin
      body := rec.content::jsonb;
    exception when others then
      body := null;
    end;

    if rec.status_code = 200 and body is not null and (body->>'ok')::boolean is true then
      -- Nothing is sent after the poll. The explanation rides along in the
      -- payload's native lamp field, which Telegram only reveals to a member
      -- once they have voted — so no follow-up message means no answer visible
      -- to people who have not voted yet.
      update telegram_scheduled_posts
        set status = 'published',
            published_at = now(),
            telegram_message_id = (body->'result'->>'message_id')::bigint,
            telegram_poll_id = (body->'result'->'poll'->>'id'),
            net_request_id = null,
            error_message = null
        where id = rec.id;
    else
      if rec.attempt_count + 1 >= 3 then
        update telegram_scheduled_posts
          set status = 'failed',
              error_message = coalesce(body->>'description', rec.content::text, 'Telegram API error'),
              attempt_count = rec.attempt_count + 1,
              net_request_id = null
          where id = rec.id;
      else
        update telegram_scheduled_posts
          set status = 'scheduled',
              attempt_count = rec.attempt_count + 1,
              net_request_id = null,
              error_message = coalesce(body->>'description', rec.content::text, 'Telegram API error (will retry)')
          where id = rec.id;
      end if;
    end if;
  end loop;

  -- Orphans: pg_net dropped the request or it's taking unreasonably long.
  update telegram_scheduled_posts
    set status = 'scheduled', net_request_id = null
    where status = 'publishing' and publishing_started_at < now() - interval '5 minutes';

  -- Phase 2: claim and fire newly-due posts.
  for claim in
    update telegram_scheduled_posts
      set status = 'publishing', publishing_started_at = now()
      where id in (
        select id from telegram_scheduled_posts
        where status = 'scheduled' and scheduled_at <= now()
        order by scheduled_at
        for update skip locked
      )
      returning id, telegram_channel, content_snapshot
  loop
    payload := jsonb_build_object(
      'chat_id', claim.telegram_channel,
      'question', claim.content_snapshot->>'question',
      'options', (select jsonb_agg(jsonb_build_object('text', opt)) from jsonb_array_elements_text(claim.content_snapshot->'pollOptions') opt),
      'type', 'quiz',
      'correct_option_ids', claim.content_snapshot->'correctOptionIds',
      'is_anonymous', true
    );

    -- Without is_multiple, Telegram grades a multi-answer question as
    -- single-answer. Derived from the correct-option count, which is exactly
    -- what buildTelegramSnapshot decided in TypeScript.
    if jsonb_array_length(claim.content_snapshot->'correctOptionIds') > 1 then
      payload := payload || jsonb_build_object('is_multiple', true);
    end if;

    -- explanation is hard-capped at 200 chars by the Bot API and sendPoll
    -- fails outright if exceeded. Snapshots are pre-truncated; this protects
    -- rows frozen before that was true.
    if (claim.content_snapshot->>'quizExplanation') is not null then
      payload := payload || jsonb_build_object('explanation', left(claim.content_snapshot->>'quizExplanation', 200));
    end if;

    update telegram_scheduled_posts
      set net_request_id = (
        select net.http_post(
          url := 'https://api.telegram.org/bot' || bot_token || '/sendPoll',
          body := payload,
          headers := jsonb_build_object('Content-Type', 'application/json')
        )
      )
      where id = claim.id;
  end loop;
end;
$$ language plpgsql security definer set search_path = public, net, vault;

-- The follow-up pointer is no longer written by anything. Clearing it stops
-- the dashboard and any stale links from pointing at a message that will never
-- exist; the columns themselves are left in place so this stays reversible.
update telegram_scheduled_posts
   set telegram_followup_message_id = null,
       followup_net_request_id = null
 where telegram_followup_message_id is not null
    or followup_net_request_id is not null;

drop index if exists idx_telegram_posts_followup;