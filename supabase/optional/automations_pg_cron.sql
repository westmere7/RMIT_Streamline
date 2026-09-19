-- =============================================================================
-- automations_pg_cron.sql — OPTIONAL, and not applied by anything.
--
-- `supabase/optional/` is not one of the directories scripts/db-migrate.mjs
-- reads (it reads migrations/ then policies/), so nothing here runs unless
-- somebody runs it. That is deliberate: this file needs two extensions that may
-- not be enabled on a given project, and a migration that fails takes every
-- later migration down with it.
--
-- WHAT IT IS FOR
--
-- Board automations are drained by /api/automations/run. Something has to call
-- that endpoint on a timer, and out of the box that is the GitHub Actions
-- workflow in .github/workflows/automations.yml — every five minutes, free, and
-- dependent on GitHub being up and on time, which scheduled workflows sometimes
-- are not.
--
-- This is the better version where it is available: the database calls the app
-- itself, every minute, with nothing in between. A status change fires its rule
-- within the minute; "every Monday at 9am" is nine o'clock rather than nine and
-- a bit. Use it *instead of* the workflow, not as well — two schedulers are
-- safe (every event is claimed, every scheduled firing takes a receipt) but
-- there is no reason to pay for both.
--
-- HOW TO APPLY IT
--
--   1. In the Supabase dashboard, Database > Extensions, enable `pg_cron` and
--      `pg_net`. Both ship with Supabase; neither is on by default.
--   2. Edit the two settings at the top of the DO block below.
--   3. Run this file in the SQL editor.
--   4. Check it took:  select * from cron.job;
--      And that it is working:  select * from cron.job_run_details order by start_time desc limit 10;
--
-- To stop it:  select cron.unschedule('streamline-automations');
--
-- A NOTE ON THE SECRET
--
-- The secret is written into a cron job definition, which any database
-- superuser can read. That is the same trust boundary as the service key the
-- app already holds, but it is worth knowing before you paste it. If that is
-- not acceptable, use the GitHub Actions workflow, where the secret lives in
-- GitHub's secret store instead.
-- =============================================================================

do $$
declare
  -- ---- Edit these two --------------------------------------------------------
  v_url    text := 'https://rmit-streamline.vercel.app/api/automations/run';
  v_secret text := 'PUT-THE-SAME-VALUE-AS-THE-AUTOMATION_SECRET-ENV-VAR-HERE';
  -- ---------------------------------------------------------------------------
  v_missing text[] := '{}';
  v_net     text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    v_missing := v_missing || 'pg_cron';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    v_missing := v_missing || 'pg_net';
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'Enable % in Database > Extensions first.', array_to_string(v_missing, ' and ');
  end if;

  if v_secret like 'PUT-THE-SAME-VALUE%' then
    raise exception 'Set v_secret to the deployment''s AUTOMATION_SECRET before running this.';
  end if;

  -- Where pg_net actually put http_post. Supabase has moved it between the
  -- `net` and `extensions` schemas across versions, and a job that names the
  -- wrong one fails silently once a minute for ever, which is precisely the
  -- failure this whole exercise exists to stop happening.
  select n.nspname into v_net
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'http_post' limit 1;
  if v_net is null then
    raise exception 'pg_net is installed but http_post was not found. Re-enable the extension.';
  end if;

  -- Unschedule first so running this twice replaces the job rather than
  -- raising, and so editing the URL is one paste rather than two steps.
  perform cron.unschedule('streamline-automations')
  where exists (select 1 from cron.job where jobname = 'streamline-automations');

  perform cron.schedule(
    'streamline-automations',
    '* * * * *',
    format(
      $job$
        select %I.http_post(
          url     := %L,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L),
          body    := '{}'::jsonb,
          -- Fire and forget. pg_net queues the request and the cron job ends; a
          -- slow drain must never hold a database worker open, and the reply is
          -- of no interest here. What the run did is in automation_runs, and
          -- whether it ran at all is in automation_heartbeat.
          timeout_milliseconds := 5000
        );
      $job$,
      v_net,
      v_url,
      'Bearer ' || v_secret
    )
  );

  raise notice 'Scheduled streamline-automations, every minute, against % via %.http_post.', v_url, v_net;
end $$;
