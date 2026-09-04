-- =============================================================================
-- RLS for item_links. Apply after policies/0001_rls_policies.sql and
-- migrations/0002_item_links.sql.
--
-- Mirrors the checks in ItemLinkService / the link dialog: creating or removing
-- a link writes to both boards, so it needs edit rights on both. Seeing that a
-- link exists only needs view rights on one side; the far item itself stays
-- hidden by the `items` policies when the user cannot view that board.
-- =============================================================================

create or replace function private.item_board(p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.board_id from public.items i where i.id = p_item_id
$$;

alter table public.item_links enable row level security;

create policy item_links_select on public.item_links
  for select to authenticated
  using (
    private.can_view_board(private.item_board(item_a_id))
    or private.can_view_board(private.item_board(item_b_id))
  );

create policy item_links_insert on public.item_links
  for insert to authenticated
  with check (
    private.can_edit_board(private.item_board(item_a_id))
    and private.can_edit_board(private.item_board(item_b_id))
    and created_by = (select auth.uid())
  );

create policy item_links_delete on public.item_links
  for delete to authenticated
  using (
    private.can_edit_board(private.item_board(item_a_id))
    and private.can_edit_board(private.item_board(item_b_id))
  );

-- Only the field list may change after creation; both boards must be editable.
create policy item_links_update on public.item_links
  for update to authenticated
  using (
    private.can_edit_board(private.item_board(item_a_id))
    and private.can_edit_board(private.item_board(item_b_id))
  )
  with check (
    private.can_edit_board(private.item_board(item_a_id))
    and private.can_edit_board(private.item_board(item_b_id))
  );

alter publication supabase_realtime add table public.item_links;
