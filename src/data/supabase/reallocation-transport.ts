import type { Board, Item } from "@/domain";
import type { ReallocationTransport } from "@/services/reallocation-service";
import { callApi } from "./api-call";

/**
 * Re-allocating against Supabase goes through src/app/api/reallocate
 * (src/server/reallocation.ts): it deletes the task's activity and everyone's
 * updates on it, which no member's session may do, after checking with the
 * caller's own rights that they can edit both boards.
 */
export class HttpReallocationTransport implements ReallocationTransport {
  async reallocate(input: { itemId: string; groupId?: string; newGroupName?: string }): Promise<{ item: Item; board: Board }> {
    return callApi<{ item: Item; board: Board }>("/api/reallocate", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }
}
