import type {
  Activity,
  ActivityInput,
  Board,
  BoardColumn,
  BoardColumnInput,
  BoardFavourite,
  BoardGroup,
  BoardInput,
  BoardMember,
  BoardRole,
  ColumnValue,
  Comment,
  CommentInput,
  DirectMessage,
  DirectMessageInput,
  EntityId,
  Item,
  ItemColumnValue,
  ItemInput,
  ItemLink,
  ItemLinkInput,
  Notification,
  NotificationInput,
  NotificationPreferences,
  NotificationPreferencesInput,
  StoredDelivery,
  Team,
  TeamInput,
  Tracker,
  TrackerInput,
  TrackerSheet,
  TrackerSheetInput,
  TeamMember,
  TeamRole,
  User,
  UserInput,
  Workspace,
  WorkspaceMember,
} from "@/domain";

/**
 * Repository interfaces. Each has a Local (IndexedDB) implementation today and a
 * Supabase implementation later. Services depend only on these interfaces.
 */

export interface UserRepository {
  list(): Promise<User[]>;
  getById(id: EntityId): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  create(input: UserInput): Promise<User>;
  update(id: EntityId, patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User>;
}

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>;
  getById(id: EntityId): Promise<Workspace | null>;
  getBySlug(slug: string): Promise<Workspace | null>;
  update(id: EntityId, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<Workspace>;
  listMembers(workspaceId: EntityId): Promise<WorkspaceMember[]>;
  listMembershipsForUser(userId: EntityId): Promise<WorkspaceMember[]>;
  addMember(input: Omit<WorkspaceMember, "id">): Promise<WorkspaceMember>;
  updateMember(id: EntityId, patch: Partial<Omit<WorkspaceMember, "id">>): Promise<WorkspaceMember>;
  removeMember(id: EntityId): Promise<void>;
}

export interface TeamRepository {
  listByWorkspace(workspaceId: EntityId): Promise<Team[]>;
  getById(id: EntityId): Promise<Team | null>;
  create(input: TeamInput): Promise<Team>;
  update(id: EntityId, patch: Partial<Omit<Team, "id" | "createdAt">>): Promise<Team>;
  delete(id: EntityId): Promise<void>;
  listMembersByWorkspace(workspaceId: EntityId): Promise<TeamMember[]>;
  listMembers(teamId: EntityId): Promise<TeamMember[]>;
  addMember(teamId: EntityId, userId: EntityId, role: TeamRole): Promise<TeamMember>;
  removeMember(teamId: EntityId, userId: EntityId): Promise<void>;
}

export interface BoardRepository {
  listByWorkspace(workspaceId: EntityId): Promise<Board[]>;
  getById(id: EntityId): Promise<Board | null>;
  getBySlug(workspaceId: EntityId, slug: string): Promise<Board | null>;
  create(input: BoardInput & { slug: string }): Promise<Board>;
  update(id: EntityId, patch: Partial<Omit<Board, "id" | "createdAt">>): Promise<Board>;
  /** Deletes the board and every group, column, item, value, comment and favourite under it. */
  delete(id: EntityId): Promise<void>;

  listMembers(boardId: EntityId): Promise<BoardMember[]>;
  listMembersByWorkspace(workspaceId: EntityId): Promise<BoardMember[]>;
  setMember(boardId: EntityId, userId: EntityId, role: BoardRole): Promise<BoardMember>;
  removeMember(boardId: EntityId, userId: EntityId): Promise<void>;

  listFavourites(userId: EntityId): Promise<BoardFavourite[]>;
  addFavourite(boardId: EntityId, userId: EntityId): Promise<BoardFavourite>;
  removeFavourite(boardId: EntityId, userId: EntityId): Promise<void>;

  listGroups(boardId: EntityId): Promise<BoardGroup[]>;
  getGroup(id: EntityId): Promise<BoardGroup | null>;
  /** `id` lets an optimistic UI keep the id it already rendered (see useBoardMutations). */
  createGroup(input: Omit<BoardGroup, "id" | "createdAt"> & { id?: EntityId }): Promise<BoardGroup>;
  updateGroup(id: EntityId, patch: Partial<Omit<BoardGroup, "id" | "boardId" | "createdAt">>): Promise<BoardGroup>;
  /** Deletes the group and every item in it. */
  deleteGroup(id: EntityId): Promise<void>;
  reorderGroups(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardGroup[]>;

  listColumns(boardId: EntityId): Promise<BoardColumn[]>;
  createColumn(input: BoardColumnInput & { position?: number; id?: EntityId }): Promise<BoardColumn>;
  updateColumn(id: EntityId, patch: Partial<Omit<BoardColumn, "id" | "boardId" | "createdAt">>): Promise<BoardColumn>;
  /** Deletes the column and every value stored against it. */
  deleteColumn(id: EntityId): Promise<void>;
  reorderColumns(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardColumn[]>;
}

export interface ItemRepository {
  listByBoard(boardId: EntityId, options?: { includeArchived?: boolean }): Promise<Item[]>;
  listByIds(ids: EntityId[]): Promise<Item[]>;
  getById(id: EntityId): Promise<Item | null>;
  create(input: ItemInput & { position: number; id?: EntityId }): Promise<Item>;
  update(id: EntityId, patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">>): Promise<Item>;
  updateMany(patches: Array<{ id: EntityId; patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">> }>): Promise<Item[]>;
  /** Deletes items, their subitems, values and comments. */
  deleteMany(ids: EntityId[]): Promise<void>;

  listValuesByBoard(boardId: EntityId): Promise<ItemColumnValue[]>;
  listValuesByItem(itemId: EntityId): Promise<ItemColumnValue[]>;
  listValuesByColumns(columnIds: EntityId[]): Promise<ItemColumnValue[]>;
  setValue(itemId: EntityId, columnId: EntityId, value: ColumnValue): Promise<ItemColumnValue>;
  setValues(values: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }>): Promise<ItemColumnValue[]>;
}

export interface ItemLinkRepository {
  /** Links touching the item, from either side. */
  listByItem(itemId: EntityId): Promise<ItemLink[]>;
  /** Links touching any of the items (de-duplicated). */
  listByItems(itemIds: EntityId[]): Promise<ItemLink[]>;
  getById(id: EntityId): Promise<ItemLink | null>;
  /** Returns the existing link when the pair is already linked. */
  create(input: ItemLinkInput): Promise<ItemLink>;
  update(id: EntityId, patch: Partial<Pick<ItemLink, "excluded">>): Promise<ItemLink>;
  delete(id: EntityId): Promise<void>;
}

export interface TrackerRepository {
  listByWorkspace(workspaceId: EntityId): Promise<Tracker[]>;
  getById(id: EntityId): Promise<Tracker | null>;
  create(input: TrackerInput): Promise<Tracker>;
  update(id: EntityId, patch: Partial<Omit<Tracker, "id" | "workspaceId" | "createdAt">>): Promise<Tracker>;
  /** Deletes the tracker and every sheet in it. */
  delete(id: EntityId): Promise<void>;

  listSheets(trackerId: EntityId): Promise<TrackerSheet[]>;
  getSheet(id: EntityId): Promise<TrackerSheet | null>;
  createSheet(input: TrackerSheetInput): Promise<TrackerSheet>;
  updateSheet(id: EntityId, patch: Partial<Omit<TrackerSheet, "id" | "trackerId" | "createdAt">>): Promise<TrackerSheet>;
  deleteSheet(id: EntityId): Promise<void>;
  reorderSheets(trackerId: EntityId, orderedIds: EntityId[]): Promise<TrackerSheet[]>;
}

export interface CommentRepository {
  listByItem(itemId: EntityId): Promise<Comment[]>;
  create(input: CommentInput): Promise<Comment>;
  update(id: EntityId, patch: Pick<Comment, "body" | "mentionUserIds">): Promise<Comment>;
  delete(id: EntityId): Promise<void>;
}

export interface MessageRepository {
  /** Every message between two people, oldest first. */
  listThread(workspaceId: EntityId, userId: EntityId, otherUserId: EntityId): Promise<DirectMessage[]>;
  /** Every message the user sent or received in the workspace, newest first. */
  listForUser(workspaceId: EntityId, userId: EntityId): Promise<DirectMessage[]>;
  create(input: DirectMessageInput): Promise<DirectMessage>;
  /** Marks everything the user received from `otherUserId` as read. */
  markThreadRead(workspaceId: EntityId, userId: EntityId, otherUserId: EntityId): Promise<void>;
  delete(id: EntityId): Promise<void>;
}

export interface ActivityRepository {
  listByWorkspace(workspaceId: EntityId, limit: number): Promise<Activity[]>;
  listByBoard(boardId: EntityId, limit: number): Promise<Activity[]>;
  listByItem(itemId: EntityId): Promise<Activity[]>;
  create(input: ActivityInput): Promise<Activity>;
  createMany(inputs: ActivityInput[]): Promise<Activity[]>;
}

/** A notification with the delivery its recipient's preferences decided. */
export type DeliverableNotification = NotificationInput & { delivery: StoredDelivery };

export interface NotificationRepository {
  listByUser(userId: EntityId): Promise<Notification[]>;
  create(input: DeliverableNotification): Promise<Notification>;
  createMany(inputs: DeliverableNotification[]): Promise<Notification[]>;
  markRead(id: EntityId, read: boolean): Promise<Notification>;
  /** Marks read; `delivery` narrows it to one badge (used by "mark all read"). */
  markAllRead(userId: EntityId, delivery?: StoredDelivery): Promise<void>;
}

/**
 * One row per person: which events interrupt them, which boards they have
 * unsubscribed from, and whether the browser may raise an OS notification.
 */
export interface NotificationPreferencesRepository {
  /** Null when the person has never changed anything, so defaults apply. */
  get(userId: EntityId): Promise<NotificationPreferences | null>;
  save(userId: EntityId, patch: NotificationPreferencesInput): Promise<NotificationPreferences>;
  /** Preferences for several recipients at once, for the delivery decision. */
  getMany(userIds: readonly EntityId[]): Promise<Map<EntityId, NotificationPreferences>>;
}

/** Administrative operations that only make sense for a resettable local store. */
export interface DataAdminRepository {
  /** Wipes all data and re-applies the seed. */
  resetToSeed(): Promise<void>;
  /** Marks the current user as having visited a board (for "Recently visited"). */
  recordBoardVisit(userId: EntityId, boardId: EntityId): Promise<void>;
  listRecentBoardIds(userId: EntityId, limit: number): Promise<EntityId[]>;
  /** Serialises every store so the state can be moved to another browser. */
  exportAll(): Promise<DataExport>;
  /** Replaces every store with the contents of a previous export. */
  importAll(data: DataExport): Promise<void>;
}

/** Portable snapshot of the local database (Settings → Data → Export). */
export interface DataExport {
  format: "streamline-export";
  version: 1;
  exportedAt: string;
  stores: Record<string, unknown[]>;
}

export function isDataExport(value: unknown): value is DataExport {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DataExport>;
  return v.format === "streamline-export" && v.version === 1 && typeof v.stores === "object" && v.stores !== null;
}

export interface Repositories {
  users: UserRepository;
  workspaces: WorkspaceRepository;
  teams: TeamRepository;
  boards: BoardRepository;
  items: ItemRepository;
  links: ItemLinkRepository;
  trackers: TrackerRepository;
  comments: CommentRepository;
  messages: MessageRepository;
  activities: ActivityRepository;
  notifications: NotificationRepository;
  notificationPreferences: NotificationPreferencesRepository;
  admin: DataAdminRepository;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`);
    this.name = "NotFoundError";
  }
}
