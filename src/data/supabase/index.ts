import type { Repositories } from "@/data/repositories";
import { NotImplementedRepository } from "./not-implemented";

/**
 * Supabase repositories.
 *
 * Each repository maps 1:1 to a table in `supabase/migrations/0001_initial_schema.sql`.
 * Until they are implemented, every method throws `SupabaseNotImplementedError` so
 * enabling the provider by accident fails loudly rather than silently losing data.
 *
 * Implementation notes for later:
 *  - Table/column names are snake_case; use `mapRow`/`toRow` helpers per repository.
 *  - `item_column_values.value_json` is JSONB and stores the `ColumnValue` union as-is.
 *  - Cascade deletes are handled by foreign keys (`on delete cascade`), so `delete()`
 *    only needs to remove the parent row.
 *  - Realtime: subscribe to `items`, `item_column_values`, `comments`, `activities`
 *    and `notifications` in `src/features/boards/hooks/use-board-realtime.ts`
 *    (currently a documented no-op) and invalidate the matching query keys.
 */
export function createSupabaseRepositories(): Repositories {
  const stub = new NotImplementedRepository();
  return {
    users: stub.as("UserRepository"),
    workspaces: stub.as("WorkspaceRepository"),
    teams: stub.as("TeamRepository"),
    boards: stub.as("BoardRepository"),
    items: stub.as("ItemRepository"),
    comments: stub.as("CommentRepository"),
    activities: stub.as("ActivityRepository"),
    notifications: stub.as("NotificationRepository"),
    admin: stub.as("DataAdminRepository"),
  };
}
