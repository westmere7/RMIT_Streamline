-- =============================================================================
-- 0092_subscriptions.sql
--
-- Following a board or a task: anyone in the workspace can follow work they
-- can see, whether or not they are on it, and choose which kinds of change
-- reach them (status, other changes, updates, assets, tasks added, moved or
-- archived). The app reads the activity it writes and sends each follower a
-- SUBSCRIPTION notification (SubscriptionService.fanOut), so the actor's client
-- has to read who follows: members read their workspace's follows, and change
-- only their own. board_id is always set (a task's own board for a task), so
-- one indexed read finds everyone to tell.
-- =============================================================================

alter type public.notification_type add value if not exists 'SUBSCRIPTION';

create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  board_id     uuid not null references public.boards (id) on delete cascade,
  item_id      uuid references public.items (id) on delete cascade,
  events       text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists subscriptions_board_unique on public.subscriptions (user_id, board_id) where item_id is null;
create unique index if not exists subscriptions_item_unique on public.subscriptions (user_id, item_id) where item_id is not null;
create index if not exists subscriptions_board_idx on public.subscriptions (board_id);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_workspace_member(workspace_id)
    and private.can_view_board(board_id)
    and private.board_workspace(board_id) = workspace_id
    and (item_id is null or private.item_board(item_id) = board_id)
  );

drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can_view_board(board_id));

drop policy if exists subscriptions_delete on public.subscriptions;
create policy subscriptions_delete on public.subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.subscriptions is 'Who follows which boards and tasks, and which kinds of change reach them.';
