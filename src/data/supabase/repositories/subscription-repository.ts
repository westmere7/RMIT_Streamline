import type { Subscription, SubscriptionEvent, SubscriptionInput } from "@/domain";
import type { SubscriptionRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";

const SUBSCRIPTION = "id, workspace_id, user_id, board_id, item_id, events, created_at, updated_at";

interface SubscriptionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  board_id: string;
  item_id: string | null;
  events: SubscriptionEvent[];
  created_at: string;
  updated_at: string;
}

function toSubscription(row: SubscriptionRow): Subscription {
  return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, boardId: row.board_id, itemId: row.item_id, events: row.events ?? [], createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Follows. `subscriptions_*` policies (0092): members read their workspace's, and change only their own. */
export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  async listByUser(userId: string, workspaceId: string): Promise<Subscription[]> {
    const result = await db().from("subscriptions").select(SUBSCRIPTION).eq("user_id", userId).eq("workspace_id", workspaceId);
    return unwrapList<SubscriptionRow>(result, "subscriptions.listByUser").map(toSubscription);
  }

  async listByBoards(boardIds: string[]): Promise<Subscription[]> {
    if (boardIds.length === 0) return [];
    const result = await db().from("subscriptions").select(SUBSCRIPTION).in("board_id", boardIds);
    return unwrapList<SubscriptionRow>(result, "subscriptions.listByBoards").map(toSubscription);
  }

  async upsert(input: SubscriptionInput): Promise<Subscription> {
    // A follow is one row per person and target; the partial unique indexes
    // cannot back an ON CONFLICT, so look first and then update or insert.
    let query = db().from("subscriptions").select("id").eq("user_id", input.userId).eq("board_id", input.boardId);
    query = input.itemId ? query.eq("item_id", input.itemId) : query.is("item_id", null);
    const found = unwrapList<{ id: string }>(await query, "subscriptions.upsert.find")[0];
    if (found) {
      const result = await db().from("subscriptions").update({ events: input.events, updated_at: new Date().toISOString() }).eq("id", found.id).select(SUBSCRIPTION).single();
      return toSubscription(unwrap<SubscriptionRow>(result, "subscriptions.update"));
    }
    const payload = { workspace_id: input.workspaceId, user_id: input.userId, board_id: input.boardId, item_id: input.itemId, events: input.events };
    const result = await db().from("subscriptions").insert(payload).select(SUBSCRIPTION).single();
    return toSubscription(unwrap<SubscriptionRow>(result, "subscriptions.insert"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("subscriptions").delete().eq("id", id), "subscriptions.delete");
  }
}
