-- =============================================================================
-- 0114_cron_run_log_cleanup.sql
--
-- pg_cron writes a row to cron.job_run_details for every run and never removes
-- one. The automation driver (supabase/optional/automations_pg_cron.sql) runs
-- every minute, so that is 1,440 rows a day, each repeating the job's whole
-- command. By November 2026 the log was 337 MB of a 381 MB database on a plan
-- that stops at 500 MB. Worse than the rows: autovacuum had never visited the
-- table, and pg_cron updates each run's row as it goes, so every run left dead
-- versions behind that were never reclaimed (61 MB of rows in 335 MB).
--
-- Three things, all only where pg_cron is installed (it is optional, and a
-- disposable database without it must still migrate):
--
-- 1. A daily job that deletes runs older than seven days. A week is enough to
--    see whether the driver has been firing; the app's own record of what ran
--    is automation_runs and automation_heartbeat, not this log.
-- 2. A daily VACUUM of the log ten minutes later, so the space those deletes
--    and the per-run updates free is reused rather than added to. Plain VACUUM,
--    not FULL: it takes no lock that would hold up a run.
-- 3. The automation job's stored command loses its comments and spare
--    whitespace. pg_cron copies the command into every run's row, so this
--    roughly halves each new row. Nothing about what the job does changes.
--
-- Times are UTC: 20:17 is 03:17 in Ho Chi Minh City, a quiet hour.
--
-- The rows already there are cleared, and the table compacted, by hand once
-- (VACUUM FULL cannot run inside the transaction a migration runs in); after
-- that these jobs keep it at about a week's worth.
-- =============================================================================

do $$
declare
  v_job bigint;
  v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; nothing to clean up.';
    return;
  end if;

  -- cron.schedule with a name replaces a job of that name, so this is safe to run twice.
  perform cron.schedule(
    'streamline-cron-log-cleanup',
    '17 20 * * *',
    $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
  );
  perform cron.schedule(
    'streamline-cron-log-vacuum',
    '27 20 * * *',
    $job$vacuum cron.job_run_details$job$
  );

  select jobid, command into v_job, v_command from cron.job where jobname = 'streamline-automations';
  if v_job is not null then
    -- Comment lines first (newline-sensitive, so ^ is a line start), then every
    -- run of whitespace to one space. The command holds no quoted text with
    -- spaces worth keeping: a URL, a bearer token, '{}' and header names.
    v_command := btrim(regexp_replace(regexp_replace(v_command, '^[ \t]*--[^\n]*$', '', 'gn'), '\s+', ' ', 'g'));
    perform cron.alter_job(v_job, command := v_command);
  end if;
end $$;
