import type { Repositories } from "@/data/repositories";
import { LocalConnection } from "./connection";
import { LocalActivityRepository } from "./repositories/activity-repository";
import { LocalAdminRepository } from "./repositories/admin-repository";
import { LocalBoardRepository } from "./repositories/board-repository";
import { LocalBookingTemplateRepository } from "./repositories/booking-template-repository";
import { LocalCommentRepository } from "./repositories/comment-repository";
import { LocalItemAssetRepository } from "./repositories/item-asset-repository";
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
  onboarding: LocalOnboardingRepository;
};

export function isLocalRepositories(repos: Repositories): repos is LocalRepositories {
  return repos.onboarding instanceof LocalOnboardingRepository;
}

export function createLocalRepositories(options: LocalRepositoriesOptions = {}): LocalRepositories {
  const connection = new LocalConnection({ name: options.databaseName, seed: options.seed });
  return {
    connection,
    users: new LocalUserRepository(connection),
    workspaces: new LocalWorkspaceRepository(connection),
    onboarding: new LocalOnboardingRepository(connection),
    teams: new LocalTeamRepository(connection),
    boards: new LocalBoardRepository(connection),
    items: new LocalItemRepository(connection),
    links: new LocalItemLinkRepository(connection),
    trackers: new LocalTrackerRepository(connection),
    comments: new LocalCommentRepository(connection),
    itemAssets: new LocalItemAssetRepository(connection),
    bookingTemplates: new LocalBookingTemplateRepository(connection),
    itemReads: new LocalItemReadRepository(connection),
    messages: new LocalMessageRepository(connection),
    activities: new LocalActivityRepository(connection),
    notifications: new LocalNotificationRepository(connection),
    notificationPreferences: new LocalNotificationPreferencesRepository(connection),
    admin: new LocalAdminRepository(connection),
  };
}
