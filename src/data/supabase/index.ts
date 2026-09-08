import type { Repositories } from "@/data/repositories";
import { SupabaseBoardRepository } from "./repositories/board-repository";
import { SupabaseBookingTemplateRepository } from "./repositories/booking-template-repository";
import { SupabaseItemLinkRepository } from "./repositories/item-link-repository";
import { SupabaseItemRepository } from "./repositories/item-repository";
import { SupabaseItemAssetRepository } from "./repositories/item-asset-repository";
import {
  SupabaseActivityRepository,
  SupabaseAdminRepository,
  SupabaseCommentRepository,
  SupabaseItemReadRepository,
  SupabaseNotificationPreferencesRepository,
  SupabaseNotificationRepository,
} from "./repositories/misc-repositories";
import { SupabaseMessageRepository } from "./repositories/message-repository";
import { SupabaseOnboardingRepository } from "./repositories/onboarding-repository";
import { SupabaseTeamRepository } from "./repositories/team-repository";
import { SupabaseTrackerRepository } from "./repositories/tracker-repository";
import { SupabaseUserRepository } from "./repositories/user-repository";
import { SupabaseWorkspaceRepository } from "./repositories/workspace-repository";

/**
 * Supabase repositories. Each maps 1:1 to a table in `supabase/migrations/`.
 *
 * Notes that apply across the set:
 *  - Table and column names are snake_case; `rows.ts` holds the mappers.
 *  - `board_columns.settings`, `item_column_values.value_json`,
 *    `activities.metadata` and the tracker sheet `columns`/`rows` are JSONB and
 *    store the TypeScript unions verbatim.
 *  - Deletes lean on `on delete cascade`, so removing a parent row is enough.
 *  - Ids come from `gen_random_uuid()`; every write returns the stored row.
 *  - RLS filters reads, so a query returning no rows can mean "not permitted".
 */
export function createSupabaseRepositories(): Repositories {
  return {
    users: new SupabaseUserRepository(),
    workspaces: new SupabaseWorkspaceRepository(),
    onboarding: new SupabaseOnboardingRepository(),
    teams: new SupabaseTeamRepository(),
    boards: new SupabaseBoardRepository(),
    items: new SupabaseItemRepository(),
    links: new SupabaseItemLinkRepository(),
    trackers: new SupabaseTrackerRepository(),
    comments: new SupabaseCommentRepository(),
    itemAssets: new SupabaseItemAssetRepository(),
    bookingTemplates: new SupabaseBookingTemplateRepository(),
    itemReads: new SupabaseItemReadRepository(),
    messages: new SupabaseMessageRepository(),
    activities: new SupabaseActivityRepository(),
    notifications: new SupabaseNotificationRepository(),
    notificationPreferences: new SupabaseNotificationPreferencesRepository(),
    admin: new SupabaseAdminRepository(),
  };
}
