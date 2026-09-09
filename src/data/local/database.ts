import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import type {
  Activity,
  Board,
  BoardShare,
  DashboardShare,
  ItemShare,
  BoardViewKind,
  BoardColumn,
  BoardFavourite,
  BoardGroup,
  BoardMember,
  BookingTemplate,
  Comment,
  ItemRead,
  DirectMessage,
  Item,
  ItemAsset,
  ItemColumnValue,
  ItemLink,
  Notification,
  NotificationPreferences,
  Team,
  TeamMember,
  Tracker,
  TrackerSheet,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceListOption,
  StakeholderDepartment,
  DepartmentPortal,
  PortalRequest,
  PortalSubmission,
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
  /** The view this person last used on the board; absent means the default. */
  view?: BoardViewKind | null;
  /** Each view's own settings on this board, keyed by view kind. */
  viewSettings?: Record<string, unknown>;
}

/**
 * Local stand-in for Supabase Auth's password: a salted SHA-256 so the onboarding
 * flow can be exercised end to end in the browser store. Only ever compared,
 * never shown.
 */
export interface LocalCredential {
  userId: string;
  salt: string;
  hash: string;
  createdAt: string;
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
  workspaceInvitations: {
    key: string;
    value: WorkspaceInvitation;
    indexes: { byWorkspace: string; byUser: string; byToken: string };
  };
  credentials: { key: string; value: LocalCredential };
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
  itemLinks: { key: string; value: ItemLink; indexes: { byItemA: string; byItemB: string; byWorkspace: string } };
  trackers: { key: string; value: Tracker; indexes: { byWorkspace: string } };
  trackerSheets: { key: string; value: TrackerSheet; indexes: { byTracker: string } };
  comments: { key: string; value: Comment; indexes: { byItem: string } };
  itemAssets: { key: string; value: ItemAsset; indexes: { byItem: string; byBoard: string } };
  bookingTemplates: { key: string; value: BookingTemplate; indexes: { byWorkspace: string } };
  boardShares: { key: string; value: BoardShare; indexes: { byBoard: string; byToken: string } };
  dashboardShares: { key: string; value: DashboardShare; indexes: { byWorkspace: string; byToken: string } };
  workspaceLists: { key: string; value: WorkspaceListOption; indexes: { byWorkspace: string } };
  stakeholderDepartments: { key: string; value: StakeholderDepartment; indexes: { byWorkspace: string } };
  departmentPortals: { key: string; value: DepartmentPortal; indexes: { byWorkspace: string; byDepartment: string; byToken: string } };
  portalRequests: { key: string; value: PortalRequest; indexes: { byWorkspace: string; byDepartment: string; byItem: string } };
  portalSubmissions: { key: string; value: PortalSubmission; indexes: { byPortal: string; byKey: [string, string] } };
  itemShares: { key: string; value: ItemShare; indexes: { byItem: string; byToken: string } };
  itemReads: { key: string; value: ItemRead & { id: string }; indexes: { byUser: string } };
  activities: {
    key: string;
    value: Activity;
    indexes: { byWorkspace: string; byBoard: string; byItem: string };
  };
  notifications: { key: string; value: Notification; indexes: { byUser: string } };
  notificationPreferences: { key: string; value: NotificationPreferences };
  directMessages: {
    key: string;
    value: DirectMessage;
    indexes: { bySender: string; byRecipient: string; byWorkspace: string };
  };
  boardVisits: { key: string; value: BoardVisit; indexes: { byUser: string } };
  meta: { key: string; value: MetaRecord };
}

export type StoreName = StoreNames<StreamlineDB>;

export const ALL_STORES: StoreName[] = [
  "users",
  "workspaces",
  "workspaceMembers",
  "workspaceInvitations",
  "credentials",
  "teams",
  "teamMembers",
  "boards",
  "boardMembers",
  "boardFavourites",
  "boardGroups",
  "boardColumns",
  "items",
  "itemColumnValues",
  "itemLinks",
  "trackers",
  "trackerSheets",
  "comments",
  "itemAssets",
  "bookingTemplates",
  "boardShares",
  "dashboardShares",
  "workspaceLists",
  "stakeholderDepartments",
  "departmentPortals",
  "portalRequests",
  "portalSubmissions",
  "itemShares",
  "itemReads",
  "activities",
  "notifications",
  "notificationPreferences",
  "directMessages",
  "boardVisits",
  "meta",
];

export const DB_NAME = "rmit-streamline";
/** Bump when adding stores or indexes and extend `upgradeSchema` for the new version. */
export const DB_VERSION = 14;

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

/** v2: item links (Task Linking). */
function createItemLinksStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("itemLinks")) return;
  const links = db.createObjectStore("itemLinks", { keyPath: "id" });
  links.createIndex("byItemA", "itemAId");
  links.createIndex("byItemB", "itemBId");
  links.createIndex("byWorkspace", "workspaceId");
}

/** v3: trackers (in-app spreadsheets) and their sheets. */
function createTrackerStores(db: IDBPDatabase<StreamlineDB>): void {
  if (!db.objectStoreNames.contains("trackers")) {
    const trackers = db.createObjectStore("trackers", { keyPath: "id" });
    trackers.createIndex("byWorkspace", "workspaceId");
  }
  if (!db.objectStoreNames.contains("trackerSheets")) {
    const sheets = db.createObjectStore("trackerSheets", { keyPath: "id" });
    sheets.createIndex("byTracker", "trackerId");
  }
}

/** v4: direct messages between two people. */
function createDirectMessageStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("directMessages")) return;
  const messages = db.createObjectStore("directMessages", { keyPath: "id" });
  messages.createIndex("bySender", "senderId");
  messages.createIndex("byRecipient", "recipientId");
  messages.createIndex("byWorkspace", "workspaceId");
}

/** v5: per-person notification preferences. */
function createNotificationPreferencesStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("notificationPreferences")) return;
  db.createObjectStore("notificationPreferences", { keyPath: "userId" });
}

/** v6: onboarding links and the local password stand-in. */
function createOnboardingStores(db: IDBPDatabase<StreamlineDB>): void {
  if (!db.objectStoreNames.contains("workspaceInvitations")) {
    const invitations = db.createObjectStore("workspaceInvitations", { keyPath: "id" });
    invitations.createIndex("byWorkspace", "workspaceId");
    invitations.createIndex("byUser", "userId");
    invitations.createIndex("byToken", "token", { unique: true });
  }
  if (!db.objectStoreNames.contains("credentials")) {
    db.createObjectStore("credentials", { keyPath: "userId" });
  }
}

/** v7: which items each person has caught up on. */
function createItemReadsStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("itemReads")) return;
  const reads = db.createObjectStore("itemReads", { keyPath: "id" });
  reads.createIndex("byUser", "userId");
}

/** v8: the asset lines of each item. */
function createItemAssetsStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("itemAssets")) return;
  const assets = db.createObjectStore("itemAssets", { keyPath: "id" });
  assets.createIndex("byItem", "itemId");
  assets.createIndex("byBoard", "boardId");
}

/** v9: booking forms saved by name. */
function createBookingTemplatesStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("bookingTemplates")) return;
  const templates = db.createObjectStore("bookingTemplates", { keyPath: "id" });
  templates.createIndex("byWorkspace", "workspaceId");
}

/** v10: the public link of a board. */
function createBoardSharesStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("boardShares")) return;
  const shares = db.createObjectStore("boardShares", { keyPath: "id" });
  shares.createIndex("byBoard", "boardId", { unique: true });
  shares.createIndex("byToken", "token", { unique: true });
}

/** v11: the public link of the workspace dashboard. */
function createDashboardSharesStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("dashboardShares")) return;
  const shares = db.createObjectStore("dashboardShares", { keyPath: "id" });
  shares.createIndex("byWorkspace", "workspaceId", { unique: true });
  shares.createIndex("byToken", "token", { unique: true });
}

/** v12: the workspace's shared option lists. */
function createWorkspaceListsStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("workspaceLists")) return;
  const lists = db.createObjectStore("workspaceLists", { keyPath: "id" });
  lists.createIndex("byWorkspace", "workspaceId");
}

/** v13: the public link of a single task. */
function createItemSharesStore(db: IDBPDatabase<StreamlineDB>): void {
  if (db.objectStoreNames.contains("itemShares")) return;
  const shares = db.createObjectStore("itemShares", { keyPath: "id" });
  shares.createIndex("byItem", "itemId", { unique: true });
  shares.createIndex("byToken", "token", { unique: true });
}

/** v14: stakeholder departments, their portals, and what each publishes. */
function createPortalStores(db: IDBPDatabase<StreamlineDB>): void {
  if (!db.objectStoreNames.contains("stakeholderDepartments")) {
    const departments = db.createObjectStore("stakeholderDepartments", { keyPath: "id" });
    departments.createIndex("byWorkspace", "workspaceId");
  }
  if (!db.objectStoreNames.contains("departmentPortals")) {
    const portals = db.createObjectStore("departmentPortals", { keyPath: "id" });
    portals.createIndex("byWorkspace", "workspaceId");
    portals.createIndex("byDepartment", "departmentId", { unique: true });
    portals.createIndex("byToken", "token", { unique: true });
  }
  if (!db.objectStoreNames.contains("portalRequests")) {
    const requests = db.createObjectStore("portalRequests", { keyPath: "id" });
    requests.createIndex("byWorkspace", "workspaceId");
    requests.createIndex("byDepartment", "departmentId");
    // One canonical request per item, the same rule the database enforces.
    requests.createIndex("byItem", "itemId", { unique: true });
  }
  if (!db.objectStoreNames.contains("portalSubmissions")) {
    const submissions = db.createObjectStore("portalSubmissions", { keyPath: "id" });
    submissions.createIndex("byPortal", "portalId");
    // portalId + key, so a retry finds its receipt and a second insert cannot win.
    submissions.createIndex("byKey", ["portalId", "submissionKey"], { unique: true });
  }
}

/** Applies every schema step between the installed version and DB_VERSION. */
function upgradeSchema(db: IDBPDatabase<StreamlineDB>, oldVersion: number): void {
  if (oldVersion < 1) createSchema(db);
  if (oldVersion < 2) createItemLinksStore(db);
  if (oldVersion < 3) createTrackerStores(db);
  if (oldVersion < 4) createDirectMessageStore(db);
  if (oldVersion < 5) createNotificationPreferencesStore(db);
  if (oldVersion < 6) createOnboardingStores(db);
  if (oldVersion < 7) createItemReadsStore(db);
  if (oldVersion < 8) createItemAssetsStore(db);
  if (oldVersion < 9) createBookingTemplatesStore(db);
  if (oldVersion < 10) createBoardSharesStore(db);
  if (oldVersion < 11) createDashboardSharesStore(db);
  if (oldVersion < 12) createWorkspaceListsStore(db);
  if (oldVersion < 13) createItemSharesStore(db);
  if (oldVersion < 14) createPortalStores(db);
}

export interface OpenDatabaseOptions {
  name?: string;
}

export async function openStreamlineDatabase(options: OpenDatabaseOptions = {}): Promise<StreamlineDatabase> {
  return openDB<StreamlineDB>(options.name ?? DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      upgradeSchema(db, oldVersion);
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
