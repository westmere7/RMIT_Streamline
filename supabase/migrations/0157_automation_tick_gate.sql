-- The automation tick calls the app only when there is something to do.
--
-- `streamline-automations` (supabase/optional/automations_pg_cron.sql) runs
-- every minute and posts to /api/automations/run, which reads the queue, the
-- scheduled rules, sweeps and writes a heartbeat: four API requests a minute,
-- all day, with an empty queue. On 26 Nov 2026 that was 5,770 of 14,063 API
-- log lines a day, and log ingestion is capped at 1 GB a month on the Free plan.
--
-- The job keeps running every minute, but inside the database it now asks
-- first and posts only when
--   - an event is waiting (the same test the drain uses: not processed, not
--     claimed; the partial index automation_events_pending_idx covers it), or
--   - the minute is a quarter hour. Scheduled rules are set to the hour and
--     fire on the first tick inside it (receipts stop the rest), so :00 covers
--     them; four ticks an hour keep the heartbeat inside the 20-minute
--     HEARTBEAT_STALE_MINUTES the "not running" warning waits for.
-- A change made in the app still fires at once: the app nudges the runner
-- after a write. Anything else waits at most a minute, as before.
--
-- The job's command holds the deployment's secret, so it is not rewritten from
-- here: the existing command is read and the condition appended. A database
-- without pg_cron or without the job is left alone, and running this twice
-- changes nothing.

do $$
declare
  v_job bigint;
  v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  select jobid, command into v_job, v_command from cron.job where jobname = 'streamline-automations';
  if v_job is null or v_command ~ 'automation_events' then
    return;
  end if;
  if v_command !~* '^\s*select\s' or v_command ~* '\swhere\s' then
    raise notice 'streamline-automations has a command this migration does not recognise; left as it is.';
    return;
  end if;
  v_command := regexp_replace(btrim(v_command), ';\s*$', '')
    || ' where exists (select 1 from public.automation_events where processed_at is null and claimed_at is null)'
    || ' or extract(minute from now())::int % 15 = 0;';
  perform cron.alter_job(v_job, command := v_command);
end $$;
