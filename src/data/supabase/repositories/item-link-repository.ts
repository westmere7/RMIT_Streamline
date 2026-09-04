import type { ItemLink, ItemLinkInput } from "@/domain";
import { normaliseLinkPair } from "@/domain";
import type { ItemLinkRepository } from "@/data/repositories";
import { assertOk, chunk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toItemLink, type ItemLinkRow } from "../rows";

const LINK = "id, workspace_id, item_a_id, item_b_id, excluded, created_by, created_at";

export class SupabaseItemLinkRepository implements ItemLinkRepository {
  async listByItem(itemId: string): Promise<ItemLink[]> {
    return this.listByItems([itemId]);
  }

  /** A link is stored once per pair, so both sides have to be queried. */
  async listByItems(itemIds: string[]): Promise<ItemLink[]> {
    if (itemIds.length === 0) return [];
    const seen = new Map<string, ItemLink>();
    for (const part of chunk(itemIds)) {
      const list = part.map((id) => `"${id}"`).join(",");
      const result = await db().from("item_links").select(LINK).or(`item_a_id.in.(${list}),item_b_id.in.(${list})`);
      for (const row of unwrapList<ItemLinkRow>(result, "item_links.listByItems")) seen.set(row.id, toItemLink(row));
    }
    return [...seen.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
