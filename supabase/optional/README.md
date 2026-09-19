# Optional SQL

Nothing in this directory is applied by `scripts/db-migrate.mjs`. It reads
`supabase/migrations/` and then `supabase/policies/`, and stops there. Files
here are run by hand, once, when you want what they do.

## Driving the automation runner

Board automations are fired by a server, never by a page. A write raises a row
in `automation_events` from a database trigger (`migrations/0052_automations.sql`),
and `/api/automations/run` drains that queue and does whatever the clock is also
due to do. Something has to call that endpoint on a timer.

Three ways, in order of how well they work. Pick **one**.

### 1. In the database — `automations_pg_cron.sql`

The database calls the app directly, every minute. Lowest latency, nothing
third-party in the loop, and it keeps running if GitHub or Vercel's scheduler
has a bad morning. Needs the `pg_cron` and `pg_net` extensions, which ship with
Supabase but are off until you enable them in **Database → Extensions**.

Read the header of the file: there are two values to edit, and a note about
where the secret ends up.

### 2. Vercel's scheduler — Pro plan and above

Add this to `vercel.json` and set `AUTOMATION_SECRET` (or `CRON_SECRET`) in the
project's environment variables. Vercel signs its own scheduled requests, so the
endpoint accepts them without the secret being sent from anywhere else.

```json
"crons": [{ "path": "/api/automations/run", "schedule": "*/5 * * * *" }]
```

It is **not** in `vercel.json` already on purpose. Sub-daily cron is a paid
feature, and a `crons` block with a schedule the plan does not allow fails the
deployment — which would take the whole app down to add a timer.

### 3. GitHub Actions — the default

`.github/workflows/automations.yml`, already in the repo, every five minutes,
free on any plan. Set two repository secrets in **Settings → Secrets and
variables → Actions**:

| Secret | Value |
| --- | --- |
| `AUTOMATION_URL` | `https://<your-deployment>/api/automations/run` |
| `AUTOMATION_SECRET` | the same string as the `AUTOMATION_SECRET` environment variable on Vercel |

Scheduled workflows are queued, not guaranteed, and run late under load. The
rules are written so lateness only ever delays a firing: an hour-based rule
fires on the first tick inside its hour, and the receipt in
`automation_schedule_fires` stops the rest of that hour's ticks repeating it.

## Checking it is alive

```sql
select kind, count(*) filter (where processed_at is null) as waiting, count(*) as seen
from public.automation_events group by kind;

select status, summary, created_at
from public.automation_runs order by created_at desc limit 20;
```

A queue that only grows means nothing is calling the endpoint. A queue that is
empty and a log that is empty means no rule matched anything, which is a
different problem and a happier one.
