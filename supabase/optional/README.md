# Optional SQL

`scripts/db-migrate.mjs` never applies anything in this directory. It reads `supabase/migrations/` and `supabase/policies/` in `supabase/sequence.txt` order, and stops there. You run files here by hand, once, when you want what they do.

## Driving the automation runner

Board automations are fired by a server, never by a page:

1. A write raises a row in `automation_events` from a database trigger (`migrations/0052_automations.sql` and later).
2. `/api/automations/run` drains that queue, and runs whatever the clock is also due to do.

Something has to call that endpoint on a timer. There are three ways, in order of how well they work. Pick **one**.

### 1. In the database — `automations_pg_cron.sql` (what production uses)

The database calls the app directly, every minute. It has the lowest latency, nothing third-party sits in the loop, and it keeps running if GitHub or Vercel's scheduler has a bad morning.

It needs the `pg_cron` and `pg_net` extensions. They ship with Supabase but are off until you enable them in **Database → Extensions**. Enabling an extension over a pooler connection may be refused; use the dashboard toggle.

Read the header of the file: there are two values to edit (the deployment URL and the runner secret), and a note about where the secret ends up.

Production has run this job (`streamline-automations`) since 20 September 2026. Check it with:

```sql
select * from cron.job;
select status, start_time from cron.job_run_details order by start_time desc limit 10;
```

### 2. Vercel's scheduler — Pro plan and above

Add this to `vercel.json` and set `CRON_SECRET` in the project's environment variables:

```json
"crons": [{ "path": "/api/automations/run", "schedule": "*/5 * * * *" }]
```

Vercel sends that secret as a bearer token on its scheduled requests, which is what the endpoint checks for. There is no header-only fallback: with no secret configured, the runner refuses every scheduler call.

If both `AUTOMATION_SECRET` and `CRON_SECRET` are set, only `AUTOMATION_SECRET` is accepted.

The block is **not** in `vercel.json` already, on purpose. Sub-daily cron is a paid feature, and a `crons` block with a schedule the plan does not allow fails the deployment.

### 3. GitHub Actions

`.github/workflows/automations.yml` is already in the repo. It runs every five minutes and is free on a public repository. Set two repository secrets in **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `AUTOMATION_URL` | `https://<your-deployment>/api/automations/run` |
| `AUTOMATION_SECRET` | the same string as the `AUTOMATION_SECRET` environment variable on Vercel |

Scheduled workflows are queued, not guaranteed. A new five-minute schedule may not run at all on GitHub's shared pool: on this repository it showed no runs for over an hour, which is why production uses pg_cron.

A scheduled rule fires only on a tick inside its hour. The receipt in `automation_schedule_fires` stops the rest of that hour's ticks from repeating it. A driver that misses a whole hour skips that firing rather than delaying it.

## Without a driver

Rules still fire soon after someone edits a board. The app nudges the runner with that person's session, which drains up to 50 queued events.

Schedules, the sweep and the heartbeat need the timer. The Automations page says "Nothing is running these" when the heartbeat is more than 20 minutes old.

## Checking it is alive

```sql
select kind, count(*) filter (where processed_at is null) as waiting, count(*) as seen
from public.automation_events group by kind;

select status, summary, created_at
from public.automation_runs order by created_at desc limit 20;

select last_run_at from public.automation_heartbeat;
```

A queue that only grows means nothing is calling the endpoint. A queue that is empty and a log that is empty means no rule matched anything — a different problem, and a happier one.

Events that stay claimed (`claimed_at` set, `processed_at` null) belonged to a run that died mid-way. They are not retried by themselves; see audit finding F-115.
