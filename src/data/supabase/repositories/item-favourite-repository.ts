import type { ItemFavourite } from "@/domain";
import type { ItemFavouriteRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";

const FAVOURITE = "id, user_id, item_id, board_id, created_at";

interface ItemFavouriteRow {
  id: string;
  user_id: string;
  item_id: string;
  board_id: string;
  created_at: string;
}

function toFavourite(row: ItemFavouriteRow): ItemFavourite {
  return { id: row.id, userId: row.user_id, itemId: row.item_id, boardId: row.board_id, createdAt: row.created_at };
}

/** Starred tasks. `item_favourites_*` policies (0093): each person sees and changes only their own. */
export class SupabaseItemFavouriteRepository implements ItemFavouriteRepository {
  async listByUser(userId: string): Promise<ItemFavourite[]> {
    const result = await db().from("item_favourites").select(FAVOURITE).eq("user_id", userId);
    return unwrapList<ItemFavouriteRow>(result, "item_favourites.listByUser").map(toFavourite);
  }

  async add(input: Pick<ItemFavourite, "userId" | "itemId" | "boardId">): Promise<ItemFavourite> {
    // No update policy, so no upsert: an existing star is simply returned.
    const found = unwrapList<ItemFavouriteRow>(await db().from("item_favourites").select(FAVOURITE).eq("user_id", input.userId).eq("item_id", input.itemId), "item_favourites.add.find")[0];
    if (found) return toFavourite(found);
    const result = await db().from("item_favourites").insert({ user_id: input.userId, item_id: input.itemId, board_id: input.boardId }).select(FAVOURITE).single();
    return toFavourite(unwrap<ItemFavouriteRow>(result, "item_favourites.add"));
  }

  async remove(userId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    assertOk(await db().from("item_favourites").delete().eq("user_id", userId).in("item_id", itemIds), "item_favourites.remove");
  }
}
