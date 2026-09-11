import type { ItemLink, ItemLinkInput } from "@/domain";
import { normaliseLinkPair } from "@/domain";
import type { ItemLinkRepository } from "@/data/repositories";
import { assertOk, chunk, db, unwrap, unwrapAll, unwrapMaybe } from "../client";
import { pruneUndefined, toItemLink, type ItemLinkRow } from "../rows";

const LINK = "id, workspace_id, item_a_id, item_b_id, excluded, created_by, created_at";

/**
 * Item ids per request when asking about links.
 *
 * Half the usual batch: both ends of a link are matched, so every id appears in
 * the query string twice and a full-size batch pushed the URL towards the limit
 * a request is refused at.
 */
const LINK_ID_CHUNK = 100;

export class SupabaseItemLinkRepository implements ItemLinkRepository {
  async listByItem(itemId: string): Promise<ItemLink[]> {
    return this.listByItems([itemId]);
  }

  /**
   * Every link touching any of these items.
   *
   * A link is stored once per pair, so both ends have to be asked about, which
   * puts the id list in the query string twice — hence a smaller batch here
   * than elsewhere, so the URL stays inside what PostgREST will accept.
   *
   * Paged, not merely batched: the answer grows with the board, and a plain
   * select stops at PostgREST's thousand rows and says nothing about the rest.
   * A board that crossed that line lost links silently — rows simply stopped
   * showing as linked, with no error anywhere to explain it.
   */
  async listByItems(itemIds: string[]): Promise<ItemLink[]> {
    if (itemIds.length === 0) return [];
    const pages = await Promise.all(
      chunk(itemIds, LINK_ID_CHUNK).map((part) => {
        const list = part.map((id) => `"${id}"`).join(",");
        return unwrapAll<ItemLinkRow>(
          (from, to) =>
            db()
              .from("item_links")
              .select(LINK)
              .or(`item_a_id.in.(${list}),item_b_id.in.(${list})`)
              // Ordered inside the pager: `range` slices the ordered set, so the
              // order has to be the same on every page or the pages overlap.
              .order("id", { ascending: true })
              .range(from, to),
          "item_links.listByItems",
        );
      }),
    );
    // A link whose two ends are both in the list comes back from both batches.
    const seen = new Map<string, ItemLink>();
    for (const row of pages.flat()) seen.set(row.id, toItemLink(row));
    return [...seen.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Every link in the workspace. Paged for the same reason as the read above:
   * this is what the dashboard uses to count a task mirrored onto several boards
   * once, and a truncated answer would quietly count some of them twice.
   */
  async listByWorkspace(workspaceId: string): Promise<ItemLink[]> {
    const rows = await unwrapAll<ItemLinkRow>(
      (from, to) => db().from("item_links").select(LINK).eq("workspace_id", workspaceId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
      "item_links.listByWorkspace",
    );
    return rows.map(toItemLink);
  }

  async getById(id: string): Promise<ItemLink | null> {
    const result = await db().from("item_links").select(LINK).eq("id", id).maybeSingle();
    const row = unwrapMaybe<ItemLinkRow>(result, "item_links.getById");
    return row ? toItemLink(row) : null;
  }

  /** Returns the existing link when the pair is already linked. */
  async create(input: ItemLinkInput): Promise<ItemLink> {
    const [itemAId, itemBId] = normaliseLinkPair(input.itemIds[0], input.itemIds[1]);
    const existing = await db().from("item_links").select(LINK).eq("item_a_id", itemAId).eq("item_b_id", itemBId).maybeSingle();
    const found = unwrapMaybe<ItemLinkRow>(existing, "item_links.create.existing");
    if (found) return toItemLink(found);

    const payload = {
      workspace_id: input.workspaceId,
      item_a_id: itemAId,
      item_b_id: itemBId,
      excluded: input.excluded ?? [],
      created_by: input.createdBy,
    };
    const result = await db().from("item_links").insert(payload).select(LINK).single();
    return toItemLink(unwrap<ItemLinkRow>(result, "item_links.create"));
  }

  async update(id: string, patch: Partial<Pick<ItemLink, "excluded">>): Promise<ItemLink> {
    const result = await db().from("item_links").update(pruneUndefined({ excluded: patch.excluded })).eq("id", id).select(LINK).single();
    return toItemLink(unwrap<ItemLinkRow>(result, "item_links.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("item_links").delete().eq("id", id), "item_links.delete");
  }
}
