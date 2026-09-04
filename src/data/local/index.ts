import type { Repositories } from "@/data/repositories";
import { LocalConnection } from "./connection";
import { LocalActivityRepository } from "./repositories/activity-repository";
import { LocalAdminRepository } from "./repositories/admin-repository";
import { LocalBoardRepository } from "./repositories/board-repository";
import { LocalCommentRepository } from "./repositories/comment-repository";
import { LocalItemRepository } from "./repositories/item-repository";
import { LocalNotificationRepository } from "./repositories/notification-repository";
import { LocalTeamRepository } from "./repositories/team-repository";
import { LocalUserRepository } from "./repositories/user-repository";
import { LocalWorkspaceRepository } from "./repositories/workspace-repository";

export interface LocalRepositoriesOptions {
  /** Database name override (used by tests to isolate state). */
  databaseName?: string;
  /** Whether to apply seed data on first open. Defaults to true. */
  seed?: boolean;
}

export function createLocalRepositories(options: LocalRepositoriesOptions = {}): Repositories & {
  connection: LocalConnection;
} {
  const connection = new LocalConnection({ name: options.databaseName, seed: options.seed });
  return {
    connection,
    users: new LocalUserRepository(connection),
    workspaces: new LocalWorkspaceRepository(connection),
    teams: new LocalTeamRepository(connection),
    boards: new LocalBoardRepository(connection),
    items: new LocalItemRepository(connection),
    comments: new LocalCommentRepository(connection),
    activities: new LocalActivityRepository(connection),
    notifications: new LocalNotificationRepository(connection),
    admin: new LocalAdminRepository(connection),
  };
}
