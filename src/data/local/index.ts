import type { Repositories } from "@/data/repositories";
import { LocalConnection } from "./connection";
import { LocalActivityRepository } from "./repositories/activity-repository";
import { LocalAdminRepository } from "./repositories/admin-repository";
import { LocalAutomationRepository } from "./repositories/automation-repository";
import { LocalBoardRepository } from "./repositories/board-repository";
import { LocalBoardShareRepository } from "./repositories/board-share-repository";
import { LocalBookingSavedBlockRepository } from "./repositories/booking-saved-block-repository";
import { LocalBookingTemplateRepository } from "./repositories/booking-template-repository";
import { LocalBoardTemplateRepository } from "./repositories/board-template-repository";
import { LocalCommentRepository } from "./repositories/comment-repository";
import { LocalDashboardShareRepository } from "./repositories/dashboard-share-repository";
import { LocalItemAssetRepository } from "./repositories/item-asset-repository";
import { LocalItemShareRepository } from "./repositories/item-share-repository";
import { LocalStakeholderPortalRepository } from "./repositories/stakeholder-portal-repository";
import { LocalWorkspaceListRepository } from "./repositories/workspace-list-repository";
import { LocalItemLinkRepository } from "./repositories/item-link-repository";
import { LocalItemReadRepository } from "./repositories/item-read-repository";
import { LocalItemRepository } from "./repositories/item-repository";
import { LocalMessageRepository } from "./repositories/message-repository";
import { LocalNotificationPreferencesRepository, LocalNotificationRepository } from "./repositories/notification-repository";
import { LocalOnboardingRepository } from "./repositories/onboarding-repository";
import { LocalTeamRepository } from "./repositories/team-repository";
import { LocalTrackerRepository } from "./repositories/tracker-repository";
import { LocalUserRepository } from "./repositories/user-repository";
import { LocalWorkspaceRepository } from "./repositories/workspace-repository";

export interface LocalRepositoriesOptions {
  /** Database name override (used by tests to isolate state). */
  databaseName?: string;
  /** Whether to apply seed data on first open. Defaults to true. */
  seed?: boolean;
}

/** The local set carries two extras: its connection, and the password stand-in the auth provider checks. */
export type LocalRepositories = Repositories & {
  connection: LocalConnection;
  automations: LocalAutomationRepository;
  onboarding: LocalOnboardingRepository;
};

export function isLocalRepositories(repos: Repositories): repos is LocalRepositories {
  return repos.onboarding instanceof LocalOnboardingRepository;
}

export function createLocalRepositories(options: LocalRepositoriesOptions = {}): LocalRepositories {
  const connection = new LocalConnection({ name: options.databaseName, seed: options.seed });
  // Supabase has database triggers to fill the automation queue; IndexedDB has
  // none, so the item repository is handed the queue and fills it as it writes.
  const automations = new LocalAutomationRepository(connection);
  return {
    connection,
    automations,
    users: new LocalUserRepository(connection),
    workspaces: new LocalWorkspaceRepository(connection),
    onboarding: new LocalOnboardingRepository(connection),
    teams: new LocalTeamRepository(connection),
    boards: new LocalBoardRepository(connection),
    items: new LocalItemRepository(connection, automations),
    links: new LocalItemLinkRepository(connection),
    trackers: new LocalTrackerRepository(connection),
    comments: new LocalCommentRepository(connection, automations),
    itemAssets: new LocalItemAssetRepository(connection),
    workspaceLists: new LocalWorkspaceListRepository(connection),
    stakeholderPortals: new LocalStakeholderPortalRepository(connection),
    bookingTemplates: new LocalBookingTemplateRepository(connection),
    boardTemplates: new LocalBoardTemplateRepository(connection),
    bookingSavedBlocks: new LocalBookingSavedBlockRepository(connection),
    boardShares: new LocalBoardShareRepository(connection),
    itemShares: new LocalItemShareRepository(connection),
    dashboardShares: new LocalDashboardShareRepository(connection),
    itemReads: new LocalItemReadRepository(connection),
    messages: new LocalMessageRepository(connection),
    activities: new LocalActivityRepository(connection),
    notifications: new LocalNotificationRepository(connection),
    notificationPreferences: new LocalNotificationPreferencesRepository(connection),
    admin: new LocalAdminRepository(connection),
  };
}
