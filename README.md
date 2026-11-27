# Streamline

Work management for the RMIT creative and marketing team. Stakeholders book work through one form, the team plans and delivers it on boards, automations do the follow-up, and a live dashboard shows who is carrying what.

**Version 0.170.2** · [Open the app](https://rmit-streamline.vercel.app) · [Knowledge base](KNOWLEDGE_BASE.md) · [Changelog](src/lib/changelog.ts) · [Development instructions](AGENTS.md)

![Workspace home](public/guide/home.webp)

## Screenshots

### Boards

<table>
  <tr>
    <td><img src="public/guide/board-table.webp" width="420" alt="Main table"><br><sub>Main table: groups, typed columns, tickets.</sub></td>
    <td><img src="public/guide/board-kanban.webp" width="420" alt="Kanban"><br><sub>Kanban, lanes by status, person, group or any dropdown.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/board-timeline.webp" width="420" alt="Timeline"><br><sub>Timeline on the board's dates.</sub></td>
    <td><img src="public/guide/board-workload.webp" width="420" alt="Workload"><br><sub>Workload per person per week.</sub></td>
  </tr>
</table>

### Tasks

<table>
  <tr>
    <td><img src="public/guide/task-panel.webp" width="420" alt="Task side panel"><br><sub>Side panel: columns, description, links, subitems.</sub></td>
    <td><img src="public/guide/task-popup.webp" width="420" alt="Task pop-up"><br><sub>Pop-up: one feed on the left, the task on the right.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/task-assets.webp" width="420" alt="Assets tab"><br><sub>Assets: deliverables with type, quantity, owners and due dates.</sub></td>
    <td><img src="public/guide/task-activity.webp" width="420" alt="Activity feed"><br><sub>Activity: names open the task, field, asset or person.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/task-journey.webp" width="420" alt="Task journey"><br><sub>Journey from booking to done, with time in each status.</sub></td>
    <td></td>
  </tr>
</table>

### Booking

<table>
  <tr>
    <td><img src="public/guide/booking-essentials.webp" width="420" alt="Essentials step"><br><sub>Essentials: who, what, when, which service.</sub></td>
    <td><img src="public/guide/booking-brief.webp" width="420" alt="Brief step"><br><sub>Brief: the service's own questions.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/booking-confirm.webp" width="420" alt="Confirm step"><br><sub>Confirm before sending.</sub></td>
    <td><img src="public/guide/booking-receipt.webp" width="420" alt="Receipt"><br><sub>Receipt with the ticket, PDF and a link to the task.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/form-editor.webp" width="420" alt="Form editor"><br><sub>Form editor: services, questions, where bookings go.</sub></td>
    <td><img src="public/guide/saved-forms-overwrite.webp" width="420" alt="Saved forms"><br><sub>Saved forms: publish, schedule, or save over one.</sub></td>
  </tr>
</table>

### Allocation and send back

<table>
  <tr>
    <td><img src="public/guide/allocation-menu.webp" width="420" alt="Task menu"><br><sub>Allocate to and Send back lead a booked task's menu.</sub></td>
    <td><img src="public/guide/send-back-dialog.webp" width="420" alt="Send back"><br><sub>Send back: say what's missing, copy the link.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/sent-back-row.webp" width="420" alt="Sent back chip"><br><sub>Sent back replaces the status while it waits.</sub></td>
    <td><img src="public/guide/resubmit-form.webp" width="420" alt="Requester's form"><br><sub>The requester's form, filled in, with the team's note.</sub></td>
  </tr>
</table>

### Portals and sharing

<table>
  <tr>
    <td><img src="public/guide/guest-portal.webp" width="420" alt="Guest portal"><br><sub>Guest portal: stakeholders follow their requests.</sub></td>
    <td><img src="public/guide/internal-portal.webp" width="420" alt="Internal portal"><br><sub>Internal portal: every team's work, for admins and allocators.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/portal-booking.webp" width="420" alt="Portal and Booking"><br><sub>Portal and Booking: switches, links and settings.</sub></td>
    <td><img src="public/guide/task-link-page.webp" width="420" alt="Shared task page"><br><sub>A shared task, read-only, with somewhere to go from it.</sub></td>
  </tr>
</table>

### Automations

<table>
  <tr>
    <td><img src="public/guide/automations.webp" width="420" alt="Board automations"><br><sub>A board's rules, recipes and quick runs.</sub></td>
    <td><img src="public/guide/automation-time.webp" width="420" alt="Rule builder"><br><sub>When / Only if / Then, here with a time check.</sub></td>
  </tr>
</table>

### You and the team

<table>
  <tr>
    <td><img src="public/guide/my-work.webp" width="420" alt="My Work"><br><sub>My Work: everything you're on, by due date.</sub></td>
    <td><img src="public/guide/inbox.webp" width="420" alt="Inbox"><br><sub>Inbox: notifications and quieter updates.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/dashboard.webp" width="420" alt="Dashboard"><br><sub>Dashboard: tasks, units or effort, against last year.</sub></td>
    <td><img src="public/guide/profile.webp" width="420" alt="Profile"><br><sub>Profile: figures open the tasks behind them.</sub></td>
  </tr>
  <tr>
    <td><img src="public/guide/members.webp" width="420" alt="Members"><br><sub>Members: roles, approvals, join links.</sub></td>
    <td></td>
  </tr>
</table>

### Trackers and docs

<table>
  <tr>
    <td><img src="public/guide/trackers.webp" width="420" alt="Tracker sheet"><br><sub>Trackers: sheets with fill, formats and Excel round trips.</sub></td>
    <td><img src="public/guide/docs.webp" width="420" alt="Docs"><br><sub>Docs: pages beside boards and trackers.</sub></td>
  </tr>
</table>

### On a phone

<table>
  <tr>
    <td><img src="public/guide/mobile-board.webp" width="260" alt="Board on a phone"><br><sub>Boards as cards.</sub></td>
    <td><img src="public/guide/mobile-task.webp" width="260" alt="Task on a phone"><br><sub>A task, full screen.</sub></td>
  </tr>
</table>

## What it does

- **Boards** with 25 column types, six views (Table, Kanban, Timeline, Calendar, Gantt, Workload), saved views, templates and tickets such as `CP_014`.
- **Tasks** with deliverables, threaded updates, checklists, pins, linked tasks on other boards, and a journey from booking to archive.
- **Booking** through one four-step form, in the app or at `/<workspace>/booking`. Bookings land on a team board or in **Task Allocation** for an admin or allocator to allocate. A booking can be sent back to its requester for what's missing.
- **Portals.** The Guest portal (`/<workspace>/portal`) shows stakeholders their work; the Internal portal shows every team's work to admins and allocators.
- **Automations** run on the server from a database queue: event, schedule and manual triggers, conditions including the time of day or week.
- **Dashboard**, **trackers** with `.xlsx` import and export, **docs**, **snapshots** of the whole database, and live updates across people and tabs.

The [knowledge base](KNOWLEDGE_BASE.md) is the developer reference: routes, services, data model, migrations and the rules not to undo.

## Run a local demo

Node.js 22.x and npm. The local demo keeps its data in the browser (IndexedDB) and needs no database.

```bash
npm ci
NEXT_PUBLIC_DATA_PROVIDER=local SKIP_DB_MIGRATE=1 npm run dev
```

```powershell
npm ci
$env:NEXT_PUBLIC_DATA_PROVIDER = 'local'; $env:SKIP_DB_MIGRATE = '1'; npm run dev
```

Open [localhost:3000](http://localhost:3000) and pick an account tile. No password is needed.

- `SKIP_DB_MIGRATE=1` matters: `dev` and `build` run the migration runner first, against whatever `SUPABASE_DB_URL` names.
- Each browser origin has its own store, so `:3000` and `:3100` differ.
- Automations don't run locally; only quick runs do.

## Connect Supabase

1. Copy [.env.example](.env.example) to `.env.local` and fill it in:

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_DATA_PROVIDER` | `supabase` (default) or `local` |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible project URL and public key; RLS enforces access |
   | `SUPABASE_DB_URL` | Server and scripts only. Use the session pooler URI |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server only: booking, portals, shares, onboarding, send back, the runner |
   | `AUTOMATION_SECRET`, `AUTOMATION_TIMEZONE` | The runner's secret, and the zone schedules and time checks read |
   | `BOOKING_LINK_SECRET` | Optional. Signs task links; without it a secret is derived from the service role key |
   | `SKIP_DB_MIGRATE` | `1` skips the migration runner |

   Never put privileged keys in `NEXT_PUBLIC_*` variables or in git.

2. Apply the schema. Files run in [`supabase/sequence.txt`](supabase/sequence.txt) order, the only order that builds an empty database.

   ```bash
   npm run db:migrate
   ```

3. Seed **only a disposable database**: `npm run db:seed` replaces the demo workspace. `npm run db:seed:topup` adds demo extras without replacing anything.

4. Schedule the automation runner (`/api/automations/run`). Production uses pg_cron; the options are in [supabase/optional/README.md](supabase/optional/README.md).

5. `npm run dev` and sign in.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build, serve. `dev` and `build` migrate first unless `SKIP_DB_MIGRATE=1` |
| `npm run check` | Lint, typecheck and unit tests |
| `npm run test:e2e` | Playwright on the local provider (`:3100`); run with `SKIP_DB_MIGRATE=1` |
| `npm run test:e2e:supabase` | Supabase smoke suite; only where `.env.local` names a disposable database |
| `npm run test:e2e:deployment` | Smoke tests against a deployed URL (defaults to production, and writes) |
| `npm run db:migrate` | Apply pending SQL (`--dry` lists, `--baseline` records without running) |
| `npm run db:seed` / `db:seed:topup` | Replace the demo workspace / add demo extras |
| `npm run db:special-columns` | Give every board its special columns |
| `npm run db:snapshot:rehearse` | Check a snapshot still round-trips the schema |
| `npm run db:setup` | Migrate, seed and switch `.env.local` to Supabase |
| `npm run tickets:dedupe` | Find, and with `--apply` renumber, shared tickets |

Adding SQL: take the next number, append it to `supabase/sequence.txt` (`tests/unit/sql-sequence.test.ts` checks), and prove it on a disposable database first. Pushing to `main` applies it to production.

## Deployment

Vercel ([vercel.json](vercel.json)) builds with `npm run build`, which applies pending SQL when `SUPABASE_DB_URL` is set; functions run in `sin1`. Every version bump needs a [changelog](src/lib/changelog.ts) entry (`tests/unit/changelog.test.ts`); open tabs see a card with What's new when a new build lands.

## Stack

Next.js 16, React 19, TypeScript (strict), Tailwind CSS 4, Radix UI, TanStack Query, Zustand, Tiptap, Zod, ExcelJS, jsPDF; Supabase (Postgres, Auth, Realtime, Storage) with pg_cron; Vitest and Playwright.

## Before changing code

Read [AGENTS.md](AGENTS.md): this Next.js version differs from earlier ones, and its guides are in `node_modules/next/dist/docs/`. Keep the local, Supabase and memory providers consistent, keep `permissions.ts` and the SQL policies aligned, and update the [knowledge base](KNOWLEDGE_BASE.md) with the behaviour it describes.
