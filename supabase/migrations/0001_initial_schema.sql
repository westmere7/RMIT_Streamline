-- =============================================================================
-- RMIT Streamline - initial schema
--
-- Mirrors the TypeScript domain model under src/domain 1:1. Every interface
-- field becomes a snake_case column; every IndexedDB object store in
-- src/data/local/database.ts becomes a table with the same indexes.
--
-- Apply order: migrations -> policies -> seed (see supabase/README.md).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums (values match the TypeScript string unions exactly)
-- -----------------------------------------------------------------------------

create type public.workspace_role as enum ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');

create type public.workspace_member_status as enum ('ACTIVE', 'INVITED', 'DEACTIVATED');

create type public.team_role as enum ('LEAD', 'MEMBER');

create type public.board_type as enum ('MAIN', 'PRIVATE', 'SHAREABLE');

create type public.board_visibility as enum ('WORKSPACE', 'TEAM', 'PRIVATE');

create type public.board_role as enum ('OWNER', 'EDITOR', 'VIEWER');

-- src/domain/board/column.ts COLUMN_TYPES
create type public.column_type as enum (
  'TEXT',
  'LONG_TEXT',
  'STATUS',
  'PERSON',
  'DATE',
  'TIMELINE',
  'NUMBER',
  'PRIORITY',
  'CHECKBOX',
  'LINK',
  'TAGS',
  'FILES',
  'DEPENDENCY'
);

-- src/domain/activity/activity.ts ACTIVITY_EVENT_TYPES
create type public.activity_event_type as enum (
  'ITEM_CREATED',
  'ITEM_RENAMED',
  'ITEM_MOVED',
  'ITEM_ARCHIVED',
  'ITEM_RESTORED',
  'ITEM_DELETED',
  'ITEM_COLUMN_VALUE_UPDATED',
  'COMMENT_ADDED',
  'BOARD_CREATED',
  'BOARD_RENAMED',
  'BOARD_ARCHIVED',
  'GROUP_CREATED',
  'GROUP_RENAMED',
  'GROUP_DELETED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED'
);

-- src/domain/notification/notification.ts
create type public.notification_type as enum (
  'MENTION',
  'ASSIGNED',
  'DUE_DATE_CHANGED',
  'STATUS_CHANGED',
  'COMMENT',
  'BOARD_INVITE'
);

create type public.notification_entity_type as enum ('ITEM', 'BOARD', 'COMMENT');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger that stamps updated_at = now().';

-- -----------------------------------------------------------------------------
-- profiles  (domain: User)  -- 1:1 with auth.users; profiles.id = auth.uid()
-- -----------------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null unique,
  first_name     text not null default '',
  last_name      text not null default '',
  display_name   text not null,
  avatar_url     text,
  job_title      text,
  department     text,
  timezone       text not null default 'UTC',
  -- Deactivated users keep their history but cannot sign in or be assigned.
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is
  'Application user profile. Row id equals auth.users.id (auth.uid()). Created automatically by handle_new_user().';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row whenever Supabase Auth inserts a user.
-- Reads first_name / last_name / display_name / avatar_url from
-- raw_user_meta_data (what the client passes as `options.data` on signUp).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first   text := coalesce(new.raw_user_meta_data ->> 'first_name', '');
  v_last    text := coalesce(new.raw_user_meta_data ->> 'last_name', '');
  v_display text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if v_display is null then
    v_display := nullif(trim(v_first || ' ' || v_last), '');
  end if;
  if v_display is null then
    v_display := new.email;
  end if;

  insert into public.profiles (id, email, first_name, last_name, display_name, avatar_url, timezone)
  values (
    new.id,
    new.email,
    v_first,
    v_last,
    v_display,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT trigger on auth.users: creates the matching public.profiles row from raw_user_meta_data.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- workspaces  (domain: Workspace)
-- -----------------------------------------------------------------------------

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  logo_url   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workspace_members  (domain: WorkspaceMember)
-- -----------------------------------------------------------------------------

create table public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'MEMBER',
  status       public.workspace_member_status not null default 'ACTIVE',
  joined_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);

-- -----------------------------------------------------------------------------
-- teams / team_members  (domain: Team, TeamMember)
-- -----------------------------------------------------------------------------

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  description  text,
  -- ColorToken, e.g. 'red' | 'navy' (validated in the app; free text here).
  color        text not null default 'gray',
  -- Lucide icon name, e.g. 'palette'.
  icon         text not null default 'users',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index teams_workspace_id_idx on public.teams (workspace_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  id      uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role    public.team_role not null default 'MEMBER',
  unique (team_id, user_id)
);

create index team_members_user_id_idx on public.team_members (user_id);
create index team_members_team_id_idx on public.team_members (team_id);

-- -----------------------------------------------------------------------------
-- boards  (domain: Board)
-- -----------------------------------------------------------------------------

create table public.boards (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- A board may outlive its team: deleting the team detaches the board.
  team_id      uuid references public.teams (id) on delete set null,
  name         text not null,
  slug         text not null,
  description  text,
  type         public.board_type not null default 'MAIN',
  visibility   public.board_visibility not null default 'WORKSPACE',
  owner_id     uuid not null references public.profiles (id),
  color        text not null default 'blue',
  icon         text not null default 'layout-grid',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index boards_workspace_id_idx on public.boards (workspace_id);
create index boards_team_id_idx on public.boards (team_id);
create index boards_owner_id_idx on public.boards (owner_id);

create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- board_members / board_favourites  (domain: BoardMember, BoardFavourite)
-- -----------------------------------------------------------------------------

create table public.board_members (
  id       uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  role     public.board_role not null default 'EDITOR',
  unique (board_id, user_id)
);

create index board_members_user_id_idx on public.board_members (user_id);
create index board_members_board_id_idx on public.board_members (board_id);

create table public.board_favourites (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (board_id, user_id)
);

create index board_favourites_user_id_idx on public.board_favourites (user_id);

-- -----------------------------------------------------------------------------
-- board_groups  (domain: BoardGroup)
-- -----------------------------------------------------------------------------

create table public.board_groups (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null,
  color      text not null default 'gray',
  position   integer not null default 0,
  collapsed  boolean not null default false,
  created_at timestamptz not null default now()
);

create index board_groups_board_id_idx on public.board_groups (board_id, position);

-- -----------------------------------------------------------------------------
-- board_columns  (domain: BoardColumn)
-- -----------------------------------------------------------------------------

create table public.board_columns (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  name       text not null,
  type       public.column_type not null,
  -- Stores the TypeScript `ColumnSettings` discriminated union verbatim, e.g.
  --   {"kind":"status","labels":[{"id":"done","name":"Done","color":"green"}],
  --    "doneLabelIds":["done"],"defaultLabelId":"not_started"}
  --   {"kind":"priority","labels":[...]}
  --   {"kind":"person","allowMultiple":true}
  --   {"kind":"number","unit":null,"decimals":0}
  --   {"kind":"tags","suggestions":[]}
  --   {"kind":"none"}
  -- Keys are camelCase because the JSON is passed through to the client as-is.
  settings   jsonb not null default '{"kind":"none"}'::jsonb,
  position   integer not null default 0,
  width      integer not null default 150,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  constraint board_columns_settings_is_object check (jsonb_typeof(settings) = 'object'),
  constraint board_columns_settings_has_kind check (settings ? 'kind')
);

comment on column public.board_columns.settings is
  'TypeScript ColumnSettings union (src/domain/board/column.ts) stored verbatim as JSON. "kind" discriminates the shape.';

create index board_columns_board_id_idx on public.board_columns (board_id, position);

-- -----------------------------------------------------------------------------
-- items  (domain: Item)
-- -----------------------------------------------------------------------------

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards (id) on delete cascade,
  group_id       uuid not null references public.board_groups (id) on delete cascade,
  -- Subitems point at their parent; deleting the parent removes the subtree.
  parent_item_id uuid references public.items (id) on delete cascade,
  name           text not null,
  description    text,
  -- Fractional positions allow O(1) reordering between neighbours.
  position       double precision not null default 0,
  -- Creator is kept for history; profiles are deactivated rather than deleted.
  created_by     uuid not null references public.profiles (id),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index items_board_id_idx on public.items (board_id);
create index items_group_id_idx on public.items (group_id);
create index items_parent_item_id_idx on public.items (parent_item_id);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Integrity: an item's group must belong to the same board as the item.
create or replace function public.enforce_item_group_board()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.board_groups g
    where g.id = new.group_id and g.board_id = new.board_id
  ) then
    raise exception 'item % group % does not belong to board %', new.id, new.group_id, new.board_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger items_enforce_group_board
  before insert or update of group_id, board_id on public.items
  for each row execute function public.enforce_item_group_board();

-- -----------------------------------------------------------------------------
-- item_column_values  (domain: ItemColumnValue)
-- -----------------------------------------------------------------------------

create table public.item_column_values (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items (id) on delete cascade,
  column_id  uuid not null references public.board_columns (id) on delete cascade,
  -- Stores the TypeScript `ColumnValue` discriminated union verbatim, e.g.
  --   {"type":"TEXT","text":"..."}
  --   {"type":"STATUS","labelId":"working"}
  --   {"type":"PERSON","userIds":["<uuid>", ...]}
  --   {"type":"DATE","date":"2026-09-08"}
  --   {"type":"TIMELINE","start":"2026-09-01","end":"2026-09-08"}
  --   {"type":"NUMBER","number":4}
  --   {"type":"PRIORITY","labelId":"high"}
  --   {"type":"CHECKBOX","checked":true}
  --   {"type":"LINK","url":"https://...","text":"Brief"}
  --   {"type":"TAGS","tags":["Video","Social"]}
  --   {"type":"FILES","files":[AttachmentMeta, ...]}
  --   {"type":"DEPENDENCY","itemIds":["<uuid>", ...]}
  -- "type" always equals the owning column's column_type. Keys are camelCase.
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  unique (item_id, column_id),
  constraint item_column_values_is_object check (jsonb_typeof(value_json) = 'object'),
  constraint item_column_values_has_type check (value_json ? 'type')
);

comment on column public.item_column_values.value_json is
  'TypeScript ColumnValue union (src/domain/item/item.ts) stored verbatim as JSON. "type" discriminates the shape and matches board_columns.type.';

create index item_column_values_item_id_idx on public.item_column_values (item_id);
create index item_column_values_column_id_idx on public.item_column_values (column_id);

create trigger item_column_values_set_updated_at
  before update on public.item_column_values
  for each row execute function public.set_updated_at();

-- Integrity: the column must live on the same board as the item.
create or replace function public.enforce_value_same_board()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.items i
    join public.board_columns c on c.board_id = i.board_id
    where i.id = new.item_id and c.id = new.column_id
  ) then
    raise exception 'column % is not on the same board as item %', new.column_id, new.item_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger item_column_values_enforce_same_board
  before insert or update of item_id, column_id on public.item_column_values
  for each row execute function public.enforce_value_same_board();

-- -----------------------------------------------------------------------------
-- comments  (domain: Comment)
-- -----------------------------------------------------------------------------

create table public.comments (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.items (id) on delete cascade,
  author_id        uuid not null references public.profiles (id),
  body             text not null,
  -- User ids mentioned with @ in the body.
  mention_user_ids uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index comments_item_id_idx on public.comments (item_id, created_at);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- activities  (domain: Activity)  -- append-only feed
-- -----------------------------------------------------------------------------

create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Detached (not deleted) when the board/item goes away so the workspace feed
  -- keeps its history; metadata carries the display names for that reason.
  board_id     uuid references public.boards (id) on delete set null,
  item_id      uuid references public.items (id) on delete set null,
  actor_id     uuid not null references public.profiles (id),
  event_type   public.activity_event_type not null,
  -- ActivityMetadata (src/domain/activity/activity.ts): itemName, boardName,
  -- groupName, fromGroupName, toGroupName, columnName, columnType, from, to,
  -- addedUserIds, removedUserIds, memberName, count. camelCase keys.
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index activities_board_id_idx on public.activities (board_id, created_at desc);
create index activities_item_id_idx on public.activities (item_id, created_at desc);
create index activities_workspace_created_idx on public.activities (workspace_id, created_at desc);

-- -----------------------------------------------------------------------------
-- notifications  (domain: Notification)
-- -----------------------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  entity_type public.notification_entity_type not null,
  -- Polymorphic reference (item / board / comment id); no FK on purpose so a
  -- notification survives deletion of its subject.
  entity_id   uuid not null,
  -- Board id for building deep links to items.
  board_id    uuid references public.boards (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_read_idx on public.notifications (user_id, read_at);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- board_visits  ("Recently visited" per user)
-- -----------------------------------------------------------------------------

create table public.board_visits (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  board_id   uuid not null references public.boards (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, board_id)
);

create index board_visits_user_visited_idx on public.board_visits (user_id, visited_at desc);
