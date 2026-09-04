import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import type {
  Activity,
  Board,
  BoardColumn,
  BoardFavourite,
  BoardGroup,
  BoardMember,
  Comment,
  Item,
  ItemColumnValue,
  Notification,
  Team,
  TeamMember,
  User,
  Workspace,
  WorkspaceMember,
} from "@/domain";

/**
 * IndexedDB schema for local mode. Object stores mirror the Supabase tables
 * one-to-one (see supabase/migrations) so that a future migration is a data
 * copy rather than a remodel.
 */
export interface BoardVisit {
  /** `${userId}:${boardId}` */
  id: string;
  userId: string;
  boardId: string;
  visitedAt: string;
}

export interface MetaRecord {
  key: string;
  value: string;
}

export interface StreamlineDB extends DBSchema {
  users: { key: string; value: User; indexes: { byEmail: string } };
  workspaces: { key: string; value: Workspace; indexes: { bySlug: string } };
  workspaceMembers: {
    key: string;
    value: WorkspaceMember;
    indexes: { byWorkspace: string; byUser: string };
  };
  teams: { key: string; value: Team; indexes: { byWorkspace: string } };
  teamMembers: { key: string; value: TeamMember; indexes: { byTeam: string; byUser: string } };
  boards: { key: string; value: Board; indexes: { byWorkspace: string } };
  boardMembers: { key: string; value: BoardMember; indexes: { byBoard: string; byUser: string } };
  boardFavourites: { key: string; value: BoardFavourite; indexes: { byUser: string; byBoard: string } };
  boardGroups: { key: string; value: BoardGroup; indexes: { byBoard: string } };
  boardColumns: { key: string; value: BoardColumn; indexes: { byBoard: string } };
  items: { key: string; value: Item; indexes: { byBoard: string; byGroup: string; byParent: string } };
  itemColumnValues: {
    key: string;
    value: ItemColumnValue;
    indexes: { byItem: string; byColumn: string };
  };
  comments: { key: string; value: Comment; indexes: { byItem: string } };
  activities: {
    key: string;
    value: Activity;
    indexes: { byWorkspace: string; byBoard: string; byItem: string };
  };
  notifications: { key: string; value: Notification; indexes: { byUser: string } };
  boardVisits: { key: string; value: BoardVisit; indexes: { byUser: string } };
  meta: { key: string; value: MetaRecord };
}

export type StoreName = StoreNames<StreamlineDB>;

export const ALL_STORES: StoreName[] = [
  "users",
  "workspaces",
  "workspaceMembers",
  "teams",
  "teamMembers",
  "boards",
  "boardMembers",
  "boardFavourites",
  "boardGroups",
  "boardColumns",
  "items",
  "itemColumnValues",
  "comments",
  "activities",
  "notifications",
  "boardVisits",
  "meta",
];

export const DB_NAME = "rmit-streamline";
export const DB_VERSION = 1;

export type StreamlineDatabase = IDBPDatabase<StreamlineDB>;
export type WriteTx<Names extends StoreName[]> = IDBPTransaction<StreamlineDB, Names, "readwrite">;

function createSchema(db: IDBPDatabase<StreamlineDB>): void {
  const users = db.createObjectStore("users", { keyPath: "id" });
  users.createIndex("byEmail", "email", { unique: true });

  const workspaces = db.createObjectStore("workspaces", { keyPath: "id" });
  workspaces.createIndex("bySlug", "slug", { unique: true });

  const workspaceMembers = db.createObjectStore("workspaceMembers", { keyPath: "id" });
  workspaceMembers.createIndex("byWorkspace", "workspaceId");
  workspaceMembers.createIndex("byUser", "userId");

  const teams = db.createObjectStore("teams", { keyPath: "id" });
  teams.createIndex("byWorkspace", "workspaceId");

  const teamMembers = db.createObjectStore("teamMembers", { keyPath: "id" });
  teamMembers.createIndex("byTeam", "teamId");
  teamMembers.createIndex("byUser", "userId");

  const boards = db.createObjectStore("boards", { keyPath: "id" });
  boards.createIndex("byWorkspace", "workspaceId");

  const boardMembers = db.createObjectStore("boardMembers", { keyPath: "id" });
  boardMembers.createIndex("byBoard", "boardId");
  boardMembers.createIndex("byUser", "userId");

  const boardFavourites = db.createObjectStore("boardFavourites", { keyPath: "id" });
  boardFavourites.createIndex("byUser", "userId");
  boardFavourites.createIndex("byBoard", "boardId");

  const boardGroups = db.createObjectStore("boardGroups", { keyPath: "id" });
  boardGroups.createIndex("byBoard", "boardId");

  const boardColumns = db.createObjectStore("boardColumns", { keyPath: "id" });
  boardColumns.createIndex("byBoard", "boardId");

  const items = db.createObjectStore("items", { keyPath: "id" });
  items.createIndex("byBoard", "boardId");
  items.createIndex("byGroup", "groupId");
  items.createIndex("byParent", "parentItemId");

  const values = db.createObjectStore("itemColumnValues", { keyPath: "id" });
  values.createIndex("byItem", "itemId");
  values.createIndex("byColumn", "columnId");

  const comments = db.createObjectStore("comments", { keyPath: "id" });
  comments.createIndex("byItem", "itemId");

  const activities = db.createObjectStore("activities", { keyPath: "id" });
  activities.createIndex("byWorkspace", "workspaceId");
  activities.createIndex("byBoard", "boardId");
  activities.createIndex("byItem", "itemId");

  const notifications = db.createObjectStore("notifications", { keyPath: "id" });
  notifications.createIndex("byUser", "userId");

  const visits = db.createObjectStore("boardVisits", { keyPath: "id" });
  visits.createIndex("byUser", "userId");

  db.createObjectStore("meta", { keyPath: "key" });
}

export interface OpenDatabaseOptions {
  name?: string;
}

export async function openStreamlineDatabase(options: OpenDatabaseOptions = {}): Promise<StreamlineDatabase> {
  return openDB<StreamlineDB>(options.name ?? DB_NAME, DB_VERSION, {
    upgrade(db) {
      createSchema(db);
    },
    blocked() {
      console.warn("[local-db] Database upgrade blocked by another open tab.");
    },
    blocking() {
      console.warn("[local-db] This tab is blocking a database upgrade in another tab.");
    },
  });
}

/** Deletes every record in every store (used by "Reset demo data"). */
export async function clearAllStores(db: StreamlineDatabase): Promise<void> {
  const tx = db.transaction(ALL_STORES, "readwrite");
  await Promise.all(ALL_STORES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
