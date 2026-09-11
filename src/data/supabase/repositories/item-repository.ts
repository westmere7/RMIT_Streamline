import type { ArchivePage, ArchiveQuery, ArchiveSortField, ColumnValue, Item, ItemColumnValue, ItemInput } from "@/domain";
import type { ItemRepository } from "@/data/repositories";
import { assertOk, chunk, db, unwrap, unwrapAll, unwrapList, unwrapMaybe } from "../client";
import { fromItemPatch, toItem, toItemColumnValue, type ItemColumnValueRow, type ItemRow } from "../rows";

const ITEM =
  "id, board_id, group_id, parent_item_id, name, description, position, created_by, archived_at, cover_url, reference, created_at, updated_at";
const VALUE = "id, item_id, column_id, value_json, updated_at";

/**
 * Aliases for the joins a filtered archive read makes onto `item_column_values`.
 * One per filter kind: the alias is what the filters on that join are addressed
 * by, so two kinds cannot be mistaken for one another.
 */
const STATUS_JOIN = "st";
const PRIORITY_JOIN = "pr";
const PEOPLE_JOIN = "pe";
const TAGS_JOIN = "tg";

const ARCHIVE_SORT_COLUMNS: Record<ArchiveSortField, string> = { archivedAt: "archived_at", name: "name" };

/** Characters that would end a PostgREST filter early or widen an `ilike` match. */
const UNSAFE_IN_FILTER = /[%_*,()"\\]/g;

/**
 * A search term safe to drop into an `ilike` pattern inside an `or`.
 *
 * `*`, `%` and `_` would widen the match, and a comma, a bracket or a quote
 * would end the filter early and be read as syntax. None of them belong in a
 * task name being searched for, so they come out rather than being escaped.
 */
function likeTerm(search: string): string {
  return search.trim().replace(UNSAFE_IN_FILTER, "").trim();
}

/**
 * "Any of these values is in that array", as a PostgREST `or` over jsonb
 * containment: `{"userIds":["…"]}` is contained by the stored value when the
 * array holds that id, and one term per choice makes the kind an "any of".
 */
function jsonArrayAny(field: string, values: readonly string[]): string {
  return values.map((value) => `value_json.cs.${JSON.stringify({ [field]: [value] })}`).join(",");
}

export class SupabaseItemRepository implements ItemRepository {
  async listByBoard(boardId: string, options?: { includeArchived?: boolean }): Promise<Item[]> {
    const rows = await unwrapAll<ItemRow>((from, to) => {
      let query = db().from("items").select(ITEM).eq("board_id", boardId);
      if (!options?.includeArchived) query = query.is("archived_at", null);
      // Ordered inside the pager: `range` slices the ordered set, so the order
      // has to be the same on every page or the pages overlap.
      return query.order("position", { ascending: true }).order("id", { ascending: true }).range(from, to);
    }, "items.listByBoard");
    return rows.map(toItem);
  }

  /**
   * One page of the board's archive.
   *
   * Everything that narrows the list is expressed as part of the query, so the
   * database does the work and the answer is the page: the filters, the order,
   * the count of what matched, and the slice. Filters that read a column value
   * become inner joins onto `item_column_values` — one alias per kind, so two
   * filters mean an item has to satisfy both, while several choices within one
   * kind mean any of them, which is how the board's own filters read.
   */
  async listArchivedPage(query: ArchiveQuery): Promise<ArchivePage<Item>> {
    const embeds: string[] = [];
    if (query.status) embeds.push(`${STATUS_JOIN}:item_column_values!inner(item_id)`);
    if (query.priority) embeds.push(`${PRIORITY_JOIN}:item_column_values!inner(item_id)`);
    if (query.people) embeds.push(`${PEOPLE_JOIN}:item_column_values!inner(item_id)`);
    if (query.tags) embeds.push(`${TAGS_JOIN}:item_column_values!inner(item_id)`);

    let request = db()
      .from("items")
      .select([ITEM, ...embeds].join(", "), { count: "exact" })
      .eq("board_id", query.boardId)
      .not("archived_at", "is", null)
      // A subitem is archived with its parent and restored with it; the archive
      // lists the tasks that were put away, not their parts.
      .is("parent_item_id", null);

    const search = likeTerm(query.search);
    if (search) request = request.or(`name.ilike.*${search}*,reference.ilike.*${search}*`);
    if (query.groupIds.length > 0) request = request.in("group_id", query.groupIds);

    if (query.status) {
      request = request.eq(`${STATUS_JOIN}.column_id`, query.status.columnId).in(`${STATUS_JOIN}.value_json->>labelId`, query.status.labelIds);
    }
    if (query.priority) {
      request = request.eq(`${PRIORITY_JOIN}.column_id`, query.priority.columnId).in(`${PRIORITY_JOIN}.value_json->>labelId`, query.priority.labelIds);
    }
    if (query.people) {
      request = request.in(`${PEOPLE_JOIN}.column_id`, query.people.columnIds).or(jsonArrayAny("userIds", query.people.userIds), { referencedTable: PEOPLE_JOIN });
    }
    if (query.tags) {
      request = request.in(`${TAGS_JOIN}.column_id`, query.tags.columnIds).or(jsonArrayAny("tags", query.tags.values), { referencedTable: TAGS_JOIN });
    }

    const ascending = query.sort.direction === "asc";
    const result = await request
      .order(ARCHIVE_SORT_COLUMNS[query.sort.field], { ascending, nullsFirst: false })
      // A second key so two rows archived in the same moment keep their order
      // between one page and the next.
      .order("id", { ascending })
      .range(query.offset, query.offset + query.limit - 1);

    // The select is assembled from the filters that are on, so it is a string
    // the client cannot type-check against the schema. The columns it asks for
    // are ITEM either way; the joins only narrow which rows come back.
    const rows = unwrapList<ItemRow>(result as unknown as { data: ItemRow[] | null; error: null }, "items.listArchivedPage");
    return { rows: rows.map(toItem), total: result.count ?? rows.length };
  }

  async countArchived(boardId: string): Promise<number> {
    const result = await db()
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("board_id", boardId)
      .not("archived_at", "is", null)
      .is("parent_item_id", null);
    assertOk(result, "items.countArchived");
    return result.count ?? 0;
  }

  async listByIds(ids: string[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const pages = await Promise.all(
      chunk(ids).map(async (part) => unwrapList<ItemRow>(await db().from("items").select(ITEM).in("id", part), "items.listByIds")),
    );
    return pages.flat().map(toItem);
  }

  async getById(id: string): Promise<Item | null> {
    const result = await db().from("items").select(ITEM).eq("id", id).maybeSingle();
    const row = unwrapMaybe<ItemRow>(result, "items.getById");
    return row ? toItem(row) : null;
  }

  async create(input: ItemInput & { position: number; id?: string }): Promise<Item> {
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      board_id: input.boardId,
      group_id: input.groupId,
      parent_item_id: input.parentItemId ?? null,
      name: input.name,
      description: input.description ?? null,
      reference: input.reference ?? null,
      position: input.position,
      created_by: input.createdBy,
    };
    const result = await db().from("items").insert(payload).select(ITEM).single();
    return toItem(unwrap<ItemRow>(result, "items.create"));
  }

  async update(id: string, patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">>): Promise<Item> {
    const result = await db().from("items").update(fromItemPatch(patch)).eq("id", id).select(ITEM).single();
    return toItem(unwrap<ItemRow>(result, "items.update"));
  }

  /**
   * One statement per distinct patch. Items in a batch usually share the same
   * change (archive, move to group), so identical patches are grouped and sent
   * as a single `in (...)` update.
   */
  async updateMany(patches: Array<{ id: string; patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">> }>): Promise<Item[]> {
    if (patches.length === 0) return [];
    const byPatch = new Map<string, { payload: Record<string, unknown>; ids: string[] }>();
    for (const { id, patch } of patches) {
      const payload = fromItemPatch(patch);
      const key = JSON.stringify(payload);
      const entry = byPatch.get(key);
      if (entry) entry.ids.push(id);
      else byPatch.set(key, { payload, ids: [id] });
    }
    const updated: Item[] = [];
    for (const { payload, ids } of byPatch.values()) {
      for (const part of chunk(ids)) {
        const result = await db().from("items").update(payload).in("id", part).select(ITEM);
        updated.push(...unwrapList<ItemRow>(result, "items.updateMany").map(toItem));
      }
    }
    return updated;
  }

  async moveToBoard(itemId: string, input: { boardId: string; groupId: string; position: number }): Promise<Item> {
    // Subitems come along: they are part of the task, and a subitem left on the
    // old board would be an orphan row its parent no longer lists.
    const subitems = await db().from("items").select("id").eq("parent_item_id", itemId);
    const moving = [itemId, ...unwrapList<{ id: string }>(subitems, "items.moveToBoard.subitems").map((row) => row.id)];

    // Values keyed by a column of the board being left. Read the destination's
    // columns and delete every value whose column is not among them, rather
    // than deleting all of them: a board may legitimately share a column id
    // with itself when the move is a no-op.
    const destColumns = await db().from("board_columns").select("id").eq("board_id", input.boardId);
    const keep = new Set(unwrapList<{ id: string }>(destColumns, "items.moveToBoard.columns").map((c) => c.id));
    for (const part of chunk(moving)) {
      const existing = await db().from("item_column_values").select("id, column_id").in("item_id", part);
      const stale = unwrapList<{ id: string; column_id: string }>(existing, "items.moveToBoard.values")
        .filter((row) => !keep.has(row.column_id))
        .map((row) => row.id);
      for (const ids of chunk(stale)) {
        if (ids.length) assertOk(await db().from("item_column_values").delete().in("id", ids), "items.moveToBoard.deleteValues");
      }
    }

    // The deliverables' denormalised board, so the new board's asset reads find
    // them and the old board's stop counting them.
    for (const part of chunk(moving)) {
      assertOk(await db().from("item_assets").update({ board_id: input.boardId }).in("item_id", part), "items.moveToBoard.assets");
    }

    // Values keep a denormalised board too, for the realtime filter. The trigger
    // that maintains it fires when a value is written, not when its item moves,
    // and a value on a column both boards share is not rewritten here — so any
    // that survived the delete above are corrected explicitly. A stale one would
    // leave this row shouting at the board it used to be on.
    for (const part of chunk(moving)) {
      assertOk(await db().from("item_column_values").update({ board_id: input.boardId }).in("item_id", part), "items.moveToBoard.values.board");
    }

    const subitemIds = moving.slice(1);
    for (const part of chunk(subitemIds)) {
      if (part.length) assertOk(await db().from("items").update({ board_id: input.boardId, group_id: input.groupId }).in("id", part), "items.moveToBoard.subitems");
    }
    const result = await db().from("items").update({ board_id: input.boardId, group_id: input.groupId, position: input.position }).eq("id", itemId).select(ITEM).single();
    return toItem(unwrap<ItemRow>(result, "items.moveToBoard"));
  }

  /** Subitems, values, comments and links cascade from the item rows. */
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const part of chunk(ids)) {
      assertOk(await db().from("items").delete().in("id", part), "items.deleteMany");
    }
  }

  // ---- Values --------------------------------------------------------------

  async listValuesByBoard(boardId: string): Promise<ItemColumnValue[]> {
    const columns = await db().from("board_columns").select("id").eq("board_id", boardId);
    const columnIds = unwrapList<{ id: string }>(columns, "item_column_values.listValuesByBoard.columns").map((c) => c.id);
    return this.listValuesByColumns(columnIds);
  }

  async listValuesByItem(itemId: string): Promise<ItemColumnValue[]> {
    const result = await db().from("item_column_values").select(VALUE).eq("item_id", itemId);
    return unwrapList<ItemColumnValueRow>(result, "item_column_values.listValuesByItem").map(toItemColumnValue);
  }

  /**
   * Every value on these columns.
   *
   * Paged, not merely chunked: the chunks bound the *filter* so the URL stays
   * short, and the range bounds the *answer* so PostgREST does not stop at its
   * default 1000 rows and leave the caller thinking that was all of them. One
   * workspace-wide read of a single column type already passes that mark.
   */
  /** As `listValuesByColumns`, filtered the other way. Same chunking, same paging. */
  async listValuesByItems(itemIds: string[]): Promise<ItemColumnValue[]> {
    if (itemIds.length === 0) return [];
    const pages = await Promise.all(
      chunk(itemIds).map((part) =>
        unwrapAll<ItemColumnValueRow>(
          (from, to) => db().from("item_column_values").select(VALUE).in("item_id", part).order("id", { ascending: true }).range(from, to),
          "item_column_values.listValuesByItems",
        ),
      ),
    );
    return pages.flat().map(toItemColumnValue);
  }

  async listValuesByColumns(columnIds: string[]): Promise<ItemColumnValue[]> {
    if (columnIds.length === 0) return [];
    const pages = await Promise.all(
      chunk(columnIds).map((part) =>
        unwrapAll<ItemColumnValueRow>(
          (from, to) => db().from("item_column_values").select(VALUE).in("column_id", part).order("id", { ascending: true }).range(from, to),
          "item_column_values.listValuesByColumns",
        ),
      ),
    );
    return pages.flat().map(toItemColumnValue);
  }

  async setValue(itemId: string, columnId: string, value: ColumnValue): Promise<ItemColumnValue> {
    const [result] = await this.setValues([{ itemId, columnId, value }]);
    if (!result) throw new Error("setValue produced no result");
    return result;
  }

  async setValues(values: Array<{ itemId: string; columnId: string; value: ColumnValue }>): Promise<ItemColumnValue[]> {
    if (values.length === 0) return [];
    // `unique (item_id, column_id)` makes this an upsert of one row per pair.
    const payload = values.map((v) => ({ item_id: v.itemId, column_id: v.columnId, value_json: v.value, updated_at: new Date().toISOString() }));
    const result = await db().from("item_column_values").upsert(payload, { onConflict: "item_id,column_id" }).select(VALUE);
    return unwrapList<ItemColumnValueRow>(result, "item_column_values.setValues").map(toItemColumnValue);
  }

  async setValuesIfAbsent(values: Array<{ itemId: string; columnId: string; value: ColumnValue }>): Promise<ItemColumnValue[]> {
    if (values.length === 0) return [];
    // `on conflict do nothing`: a pair that already has a row keeps it, so a value
    // set by the user while the item was still being created is never replaced.
    const payload = values.map((v) => ({ item_id: v.itemId, column_id: v.columnId, value_json: v.value, updated_at: new Date().toISOString() }));
    const result = await db().from("item_column_values").upsert(payload, { onConflict: "item_id,column_id", ignoreDuplicates: true }).select(VALUE);
    return unwrapList<ItemColumnValueRow>(result, "item_column_values.setValuesIfAbsent").map(toItemColumnValue);
  }
}
