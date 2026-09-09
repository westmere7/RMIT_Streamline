import type { ItemShare, ItemShareInput } from "@/domain";
import type { ItemShareRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const SHARE = "id, item_id, token, enabled, expires_at, password_hash, access, created_by, created_at, updated_at";

interface ItemShareRow {
  id: string;
  item_id: string;
  token: string;
  enabled: boolean;
  expires_at: string | null;
  password_hash: string | null;
  access: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toItemShare(row: ItemShareRow): ItemShare {
  return {
    id: row.id,
    itemId: row.item_id,
    token: row.token,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    passwordHash: row.password_hash,
    access: row.access === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Links to a single task. The `item_shares_*` policies let anyone who can see
 * the task see that a link exists and let the board's managers change it; a
 * visitor's read goes through the service role in src/server/share.ts instead,
 * because there is no session for a policy to judge.
 */
export class SupabaseItemShareRepository implements ItemShareRepository {
  async getByItem(itemId: string): Promise<ItemShare | null> {
    const result = await db().from("item_shares").select(SHARE).eq("item_id", itemId).maybeSingle();
    const row = unwrapMaybe<ItemShareRow>(result, "item_shares.getByItem");
    return row ? toItemShare(row) : null;
  }

  async getByToken(token: string): Promise<ItemShare | null> {
    const result = await db().from("item_shares").select(SHARE).eq("token", token).maybeSingle();
    const row = unwrapMaybe<ItemShareRow>(result, "item_shares.getByToken");
    return row ? toItemShare(row) : null;
  }

  async create(input: ItemShareInput): Promise<ItemShare> {
    const payload = {
      item_id: input.itemId,
      token: input.token,
      enabled: input.enabled,
      expires_at: input.expiresAt,
      password_hash: input.passwordHash,
      access: input.access,
      created_by: input.createdBy,
    };
    const result = await db().from("item_shares").insert(payload).select(SHARE).single();
    return toItemShare(unwrap<ItemShareRow>(result, "item_shares.create"));
  }

  async update(id: string, patch: Partial<Pick<ItemShare, "token" | "enabled" | "expiresAt" | "passwordHash" | "access">>): Promise<ItemShare> {
    const payload = pruneUndefined({ token: patch.token, enabled: patch.enabled, expires_at: patch.expiresAt, password_hash: patch.passwordHash, access: patch.access });
    const result = await db().from("item_shares").update(payload).eq("id", id).select(SHARE).single();
    return toItemShare(unwrap<ItemShareRow>(result, "item_shares.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("item_shares").delete().eq("id", id), "item_shares.delete");
  }
}
