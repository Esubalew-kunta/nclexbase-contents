-- The single recurring scheduler (per spec: one "telegram-publisher" job,
-- never one cron per question). Runs every minute. Two phases per tick:
--   1. Reconcile posts left 'publishing' by the previous tick, by matching
--      their stored net_request_id against pg_net's async response table
--      (pg_net has no synchronous "wait for response" call, so this two-tick
--      claim -> reconcile shape is the correct way to use it from SQL).
--   2. Claim (FOR UPDATE SKIP LOCKED, so concurrent runs can never double
--      publish the same row) and fire newly-due 'scheduled' posts.
--
-- The bot token is never stored in a table or in this file — it lives only
-- in Supabase Vault (see the companion seed step run outside version
-- control) and is read fresh on every tick.

create or replace function telegram_publisher_tick() returns void as $$
declare
  bot_token text;
  rec record;
  claim record;
  body jsonb;
  snap jsonb;
  payload jsonb;
begin
  select decrypted_secret into bot_token from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
  if bot_token is null then
    raise warning 'telegram_publisher_tick: telegram_bot_token not set in Vault, skipping this tick';
    return;
  end if;

  -- Phase 1: reconcile.
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

      snap := rec.content_snapshot;
      if (snap->>'followUpText') is not null then
        perform net.http_post(
          url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
          body := jsonb_build_object('chat_id', rec.telegram_channel, 'text', snap->>'followUpText'),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
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
    if (claim.content_snapshot->>'quizExplanation') is not null then
      payload := payload || jsonb_build_object('explanation', claim.content_snapshot->>'quizExplanation');
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

do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-publisher') then
    perform cron.unschedule('telegram-publisher');
  end if;
end $$;

select cron.schedule('telegram-publisher', '* * * * *', 'select telegram_publisher_tick();');
