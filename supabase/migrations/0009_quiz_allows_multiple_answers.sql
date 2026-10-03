-- Fixes a real bug in the live publisher, found by actually publishing a
-- multi-answer SATA question and watching Telegram reject it.
--
-- The payload built here has sent `is_multiple` since migration 0004 — a
-- field that has never existed in the Bot API. The real field is
-- `allows_multiple_answers`, and until Bot API 10.0 (May 2026) it only
-- applied to regular (non-quiz) polls; a quiz poll was hard-limited to one
-- correct_option_id, full stop. Bot API 10.0 changed `correct_option_id` to
-- `correct_option_ids` (plural, already what this function sends) and made
-- `allows_multiple_answers` apply to quiz polls too, which is what actually
-- enables multi-answer grading. Without the real field name, every SATA
-- question with 2+ correct answers published as a de-facto single-answer
-- quiz and Telegram rejected it outright with QUIZ_CORRECT_ANSWERS_TOO_MUCH.
--
-- Only this one line changes; everything else is copied verbatim from
-- migration 0004 so this stays a single, reviewable diff.

create or replace function telegram_publisher_tick() returns void as $$
declare
  bot_token text;
  rec record;
  claim record;
  body jsonb;
  snap jsonb;
  payload jsonb;
  followup_payload jsonb;
begin
  select decrypted_secret into bot_token from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if bot_token is null then
    raise warning 'telegram_publisher_tick: telegram_bot_token not set in Vault, skipping this tick';
    return;
  end if;

  -- Phase 1a: reconcile the quiz poll. pg_net has no synchronous "wait for
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
      update telegram_scheduled_posts
        set status = 'published',
            published_at = now(),
            telegram_message_id = (body->'result'->>'message_id')::bigint,
            telegram_poll_id = body->'result'->'poll'->>'id',
            net_request_id = null,
            error_message = null
        where id = rec.id;

      -- Fire the follow-up, preferring the HTML rendering. Snapshots written
      -- before this migration have followUpText only and are sent as plain
      -- text with no parse_mode, which still delivers correctly.
      snap := rec.content_snapshot;
      followup_payload := null;
      if (snap->>'followUpHtml') is not null then
        followup_payload := jsonb_build_object(
          'chat_id', rec.telegram_channel,
          'text', snap->>'followUpHtml',
          'parse_mode', 'HTML'
        );
      elsif (snap->>'followUpText') is not null then
        followup_payload := jsonb_build_object(
          'chat_id', rec.telegram_channel,
          'text', snap->>'followUpText'
        );
      end if;

      if followup_payload is not null then
        update telegram_scheduled_posts
          set followup_net_request_id = (
            select net.http_post(
              url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
              body := followup_payload,
              headers := jsonb_build_object('Content-Type', 'application/json')
            )
          )
          where id = rec.id;
      end if;
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

  -- Phase 1b: reconcile the follow-up message. Same two-tick shape as the
  -- poll — we only learn the message id from pg_net's async response on a
  -- later run. A failure here is cosmetic: the poll itself is already
  -- published, so we clear the pointer and record the error but never retry
  -- or un-publish.
  for rec in
    select tsp.id, r.status_code, r.content
    from telegram_scheduled_posts tsp
    join net._http_response r on r.id = tsp.followup_net_request_id
    where tsp.followup_net_request_id is not null
  loop
    begin
      body := rec.content::jsonb;
    exception when others then
      body := null;
    end;

    if rec.status_code = 200 and body is not null and (body->>'ok')::boolean is true then
      update telegram_scheduled_posts
        set telegram_followup_message_id = (body->'result'->>'message_id')::bigint,
            followup_net_request_id = null
        where id = rec.id;
    else
      update telegram_scheduled_posts
        set followup_net_request_id = null,
            error_message = coalesce(
              error_message,
              'Quiz published, but the follow-up message failed: ' || coalesce(body->>'description', 'unknown error')
            )
        where id = rec.id;
    end if;
  end loop;

  -- Orphans: pg_net dropped the request or it's taking unreasonably long.
  update telegram_scheduled_posts
    set status = 'scheduled', net_request_id = null
    where status = 'publishing' and publishing_started_at < now() - interval '5 minutes';

  update telegram_scheduled_posts
    set followup_net_request_id = null
    where followup_net_request_id is not null
      and updated_at < now() - interval '5 minutes';

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

    -- THE FIX: `allows_multiple_answers` is the real field name. The previous
    -- `is_multiple` was silently ignored by Telegram, so a multi-answer quiz
    -- published as single-answer and was rejected outright
    -- (QUIZ_CORRECT_ANSWERS_TOO_MUCH) the moment it had 2+ correct options.
    if jsonb_array_length(claim.content_snapshot->'correctOptionIds') > 1 then
      payload := payload || jsonb_build_object('allows_multiple_answers', true);
    end if;

    -- explanation is hard-capped at 200 chars by the Bot API and sendPoll
    -- fails outright if exceeded. New snapshots are pre-truncated; this
    -- protects rows frozen before that was true.
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
