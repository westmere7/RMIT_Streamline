# Stakeholder Portal — audit and plan

Stage 1 of the build: what the code does today, the decisions that follow from
it, and the model to implement.

## 1. What the audit found

Each of these was verified against the current checkout, not assumed.

**Stakeholder groups have no stable identity.** `WorkspaceLists` is
`Record<key, TagOption[]>` and `TagOption` is `{ name, color }` — the IDs never
reach the consumers. Both repositories implement `replace()` by deleting every
row for the list and inserting fresh ones with `newId()`, so option IDs change
on every save. `STAKEHOLDER` column values store the group *name*.

**Workspace-list handling for stakeholders is a stub.** `WorkspaceListService.usage()`
returns `{ count: 0 }` for anything that is not `ASSET_TYPES`, and `rewrite()`
returns early. Renaming a stakeholder group today updates the list and leaves
every `STAKEHOLDER` cell on the old word.

**Defaults are materialised nowhere.** `workspaceLists()` substitutes
`DEFAULT_STAKEHOLDER_GROUPS` in the domain when a list has no rows. A workspace
that has never opened Settings → Lists has five stakeholder groups that exist
only in memory.

**`item.description` is not a public brief.** `mapBookingToColumns` puts any
answer with no matching column into `leftover`, and `describeBooking` appends
those to the description under "Request details". `requesterName`,
`requesterEmail` and `department` all take that path whenever the receiving
board lacks a column for them. Publishing the raw description would leak
requester email addresses.

**Booking department is free text.** `BookingRequest.department` is
`string | null`, mapped to a TEXT column or the description.

**Links are unordered pairs.** `ItemLink` sorts the pair by ID
(`normaliseLinkPair`), so `itemAId` says nothing about origin. Links carry name,
description, reference and the shared Updates thread unless excluded.
Allocation creates a second item plus a link; assets and subitems are *copied*
at booking time, not synchronised.

**Privileged reads use a process-wide switch.** `routeRepositoriesThrough()`
sets a module-level `override`. It is safe for the service role because that
client is a singleton with no per-user state; it must never carry a request's
department or viewer.

**Share passwords are not adaptive.** `hashPassword` is a single round of
SHA-256 over `salt:password`.

**Public pages poll.** The shared board fetches on `SHARE_REFRESH_MS` and
documents why: no session to hang a subscription on.

## 2. Product decisions

Numbered against the brief's section 3, with departures called out.

1. **Department = workspace stakeholder group.** Not the delivery team, not a
   profile's free-text department.
2. **Departure — a durable department registry, not preserved option IDs.**
   The brief allows either. Preserving option IDs means changing the `replace()`
   contract in two repositories plus the memory adapter, and the IDs still would
   not survive an option being removed and re-added, which is precisely when a
   portal must *not* inherit history. A registry (`stakeholder_departments`)
   gives a department a lifetime independent of a list row.
   **Drift is prevented by keeping one editing surface**: Settings → Lists stays
   the only place stakeholder groups are edited, and saving that list reconciles
   the registry in the same operation. Identity flows through the `renames` map
   the Lists UI *already* produces, so a rename is an explicit signal rather
   than a name match: renamed → same department, new name → new department,
   missing name → department disabled (never deleted, never reassigned).
3. **One virtual board.** The portal aggregates by provenance; no items move, no
   duplicates are created, no internal boards merge.
4. Receiving-board and Task Allocation routing is untouched.
5. **The server resolves the department from the portal credential.** The
   request body's department is ignored entirely for portal bookings.
6. **Membership is the `portal_requests` row**, not a label match.
7. New portal bookings associate automatically; historical tasks only through an
   authorised import with a dry-run.
8. Editing a `STAKEHOLDER` cell does not move a published request. Reassignment
   is a separate authorised action.
9. Canonical origin is the item named by `portal_requests.item_id`.
10. Anonymous: read the projection and book. Nothing else.
11. Signing in never widens scope or bypasses the gate.
12. Renaming a department changes its display name only.

**Additional departure — adaptive password hashing.** The brief requires a
salted *adaptive* hash. The existing `hashPassword` is one round of SHA-256.
Rather than rewrite it (which would invalidate every existing board, item and
dashboard share password), portal passwords use a new PBKDF2-SHA256 helper with
a versioned encoding (`pbkdf2$<iterations>$<salt>$<hash>`), so the two can
coexist and the older scheme can be migrated separately. Existing share
passwords are out of scope for this task and remain as they are.

## 3. Data model

Four additive tables plus two columns. All workspace-scoped, all with foreign
keys to their workspace.

```
stakeholder_departments
  id              uuid pk
  workspace_id    uuid not null → workspaces(id) on delete cascade
  name            text not null                       -- display label
  color           text not null default 'gray'
  position        int  not null default 0
  status          text not null default 'ACTIVE'      -- ACTIVE | DISABLED
  created_at, updated_at
  unique (workspace_id, lower(name)) where status = 'ACTIVE'
  index (workspace_id, status, position)

department_portals
  id                  uuid pk
  workspace_id        uuid not null → workspaces(id) on delete cascade
  department_id       uuid not null unique → stakeholder_departments(id) on delete cascade
  enabled             bool not null default false
  token               text not null unique             -- 32 chars, CSPRNG
  password_hash       text                             -- pbkdf2$…, nullable
  credential_version  int  not null default 1          -- bumped on regenerate/password change
  default_theme       text not null default 'system'   -- light | dark | system
  created_at, updated_at
  check (workspace_id = department's workspace_id)     -- via composite FK

portal_requests                                        -- provenance
  id              uuid pk
  workspace_id    uuid not null → workspaces(id) on delete cascade
  department_id   uuid not null → stakeholder_departments(id) on delete restrict
  item_id         uuid not null → items(id) on delete cascade
  source          text not null                        -- PORTAL_BOOKING | IMPORT
  public_brief    text                                 -- sanitised; NOT item.description
  booked_at       timestamptz not null default now()
  created_at, updated_at
  unique (workspace_id, item_id)                       -- one canonical request per item
  index (department_id, booked_at desc, id)            -- stable pagination
  index (workspace_id, item_id)

portal_submissions                                     -- idempotency
  id                uuid pk
  portal_id         uuid not null → department_portals(id) on delete cascade
  submission_key    text not null                      -- client-generated, portal-scoped
  request_hash      text not null                      -- rejects key reuse with a different payload
  item_id           uuid → items(id) on delete set null
  receipt           jsonb not null
  created_at
  unique (portal_id, submission_key)
```

Plus `workspaces.creative_team_name text` (presentation only; never touches
`name` or `slug`).

Composite foreign keys `(workspace_id, department_id)` and
`(workspace_id, item_id)` enforce workspace consistency in the database rather
than in request validation.

**Migrations**: `0030_stakeholder_portal.sql`, policies
`0013_stakeholder_portal_policies.sql`. Local IndexedDB goes to `DB_VERSION 14`
with four new stores and matching indexes. Existing data is untouched by both.

## 4. Permission matrix

| Actor | Browse department | Book | Comment / edit assets | Manage portal |
| --- | --- | --- | --- | --- |
| Anonymous, valid portal gate | Portal projection | Yes | No | No |
| Signed in, not a qualifying board member | Portal projection | Yes | No | No |
| Qualifying member, viewer role on the board | Portal projection | Yes | No | No |
| Qualifying board editor/owner | Portal projection | Yes | On that concrete item only | Only if also workspace admin |
| Workspace admin/owner | Via gate, or authenticated preview | Yes | Only if the item's board policy allows | Yes |

"Qualifying" means: an active `workspace_members` row in the item's workspace,
**and** `boardRoleFor()` on the concrete item's own board returning OWNER or
EDITOR. A matching email domain, a department label, or workspace visibility
alone never grants a write.

Every mutation verifies, server-side and in this order: the real session from
the bearer token; active workspace membership; the portal gate (enabled, token,
credential version, password grant); the item's membership of *this* portal;
the board role on the concrete item's board; and for an asset, the owning item
and board. Client-supplied actor IDs are ignored. A linked task's action is
checked against that linked task's own board.

## 5. Public payload allowlist

The anonymous projection is assembled field by field on the server. Nothing is
spread from a repository row.

**Published**: item id, title, `reference`, `portal_requests.public_brief`,
approved status display (name + colour + semantic role), priority display, due
date / timeline, assignee display names and avatar colour, deliverable
summaries (name, type, quantity, due date, completion), subitem titles and
completion, a linked-work count, `updatedAt`.

**Never published**: requester name/email, `item.description` (see §1), internal
comments and activity, hidden columns, allocation notes, asset notes and URLs
unless explicitly approved, member profiles beyond display name, any other
department's anything, portal tokens or hashes, board and workspace internals.

## 6. Routes

| Route | Who | Purpose |
| --- | --- | --- |
| `/portal/[token]` | public + gate | Our tasks (default) |
| `/portal/[token]/book` | public + gate | Book a task, department fixed |
| `/portal/[token]?task=<id>` | public + gate | Task detail, deep-linkable |
| `/api/portal/[token]` | GET | Gate: live, needs password, theme, department name |
| `/api/portal/[token]/tasks` | POST | Bounded, paginated projection |
| `/api/portal/[token]/tasks/[itemId]` | POST | One task's detail + linked summaries |
| `/api/portal/[token]/search` | POST | Scoped search |
| `/api/portal/[token]/book` | POST | Idempotent submission |
| `/api/portal/[token]/comments`, `…/assets` | POST | Staff-only, fully re-verified |
| `…/settings?section=portals` | admin | Management |
| `…/book` | member | Kept working; nav renamed to Stakeholder Portal |

## 7. Live updates

Anonymous visitors must not subscribe to internal tables, so `postgres_changes`
is out. The portal uses a Supabase Realtime **broadcast** channel per portal
(`portal:<id>`), carrying only `{ kind, at }` — never row data. The server emits
on the writes that matter; the client refetches through the gated endpoints,
which re-check access. Credential changes emit a revocation event and the client
drops its cache.

Bounded polling stays on as a declared fallback with a visible "updated
&lt;time&gt;" state, so a failed socket degrades honestly rather than silently.

## 8. Order of work

1. Domain + migrations + repositories (both providers) + list reconciliation.
2. Gate, scoped reads, projection, booking idempotency — with negative tests.
3. Management UI, portal UI, views, mobile, live updates.
4. Integration, compatibility, accessibility, security verification.
