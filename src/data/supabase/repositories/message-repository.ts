import type { DirectMessage, DirectMessageInput } from "@/domain";
import type { MessageRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";
import { toDirectMessage, type DirectMessageRow } from "../rows";

const MESSAGE = "id, workspace_id, sender_id, recipient_id, body, read_at, created_at";

/**
 * Direct messages. `direct_messages_select` only returns rows the caller sent or
 * received, so the queries here filter by thread rather than by permission.
 */
export class SupabaseMessageRepository implements MessageRepository {
  async listThread(workspaceId: string, userId: string, otherUserId: string): Promise<DirectMessage[]> {
    const result = await db()
      .from("direct_messages")
      .select(MESSAGE)
      .eq("workspace_id", workspaceId)
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`,
      )
      .order("created_at", { ascending: true });
    return unwrapList<DirectMessageRow>(result, "direct_messages.listThread").map(toDirectMessage);
  }

  async listForUser(workspaceId: string, userId: string): Promise<DirectMessage[]> {
    const result = await db()
      .from("direct_messages")
      .select(MESSAGE)
      .eq("workspace_id", workspaceId)
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    return unwrapList<DirectMessageRow>(result, "direct_messages.listForUser").map(toDirectMessage);
  }

  async create(input: DirectMessageInput): Promise<DirectMessage> {
    const payload = {
      workspace_id: input.workspaceId,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      body: input.body,
    };
    const result = await db().from("direct_messages").insert(payload).select(MESSAGE).single();
    return toDirectMessage(unwrap<DirectMessageRow>(result, "direct_messages.create"));
  }

  async markThreadRead(workspaceId: string, userId: string, otherUserId: string): Promise<void> {
    assertOk(
      await db()
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("recipient_id", userId)
        .eq("sender_id", otherUserId)
        .is("read_at", null),
      "direct_messages.markThreadRead",
    );
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("direct_messages").delete().eq("id", id), "direct_messages.delete");
  }
}
