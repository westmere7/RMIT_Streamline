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
  EntityId,
  Item,
  ItemColumnValue,
  ItemInput,
  Notification,
  NotificationInput,
  Team,
  TeamInput,
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
  createGroup(input: Omit<BoardGroup, "id" | "createdAt">): Promise<BoardGroup>;
  updateGroup(id: EntityId, patch: Partial<Omit<BoardGroup, "id" | "boardId" | "createdAt">>): Promise<BoardGroup>;
  /** Deletes the group and every item in it. */
  deleteGroup(id: EntityId): Promise<void>;
  reorderGroups(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardGroup[]>;

  listColumns(boardId: EntityId): Promise<BoardColumn[]>;
  createColumn(input: BoardColumnInput & { position?: number }): Promise<BoardColumn>;
  updateColumn(id: EntityId, patch: Partial<Omit<BoardColumn, "id" | "boardId" | "createdAt">>): Promise<BoardColumn>;
  /** Deletes the column and every value stored against it. */
  deleteColumn(id: EntityId): Promise<void>;
  reorderColumns(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardColumn[]>;
}

export interface ItemRepository {
  listByBoard(boardId: EntityId, options?: { includeArchived?: boolean }): Promise<Item[]>;
  listByIds(ids: EntityId[]): Promise<Item[]>;
  getById(id: EntityId): Promise<Item | null>;
  create(input: ItemInput & { position: number }): Promise<Item>;
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

export interface CommentRepository {
  listByItem(itemId: EntityId): Promise<Comment[]>;
  create(input: CommentInput): Promise<Comment>;
  update(id: EntityId, patch: Pick<Comment, "body" | "mentionUserIds">): Promise<Comment>;
  delete(id: EntityId): Promise<void>;
}

export interface ActivityRepository {
  listByWorkspace(workspaceId: EntityId, limit: number): Promise<Activity[]>;
  listByBoard(boardId: EntityId, limit: number): Promise<Activity[]>;
  listByItem(itemId: EntityId): Promise<Activity[]>;
  create(input: ActivityInput): Promise<Activity>;
  createMany(inputs: ActivityInput[]): Promise<Activity[]>;
}

export interface NotificationRepository {
  listByUser(userId: EntityId): Promise<Notification[]>;
  create(input: NotificationInput): Promise<Notification>;
  createMany(inputs: NotificationInput[]): Promise<Notification[]>;
  markRead(id: EntityId, read: boolean): Promise<Notification>;
  markAllRead(userId: EntityId): Promise<void>;
}

/** Administrative operations that only make sense for a resettable local store. */
export interface DataAdminRepository {
  /** Wipes all data and re-applies the seed. */
  resetToSeed(): Promise<void>;
  /** Marks the current user as having visited a board (for "Recently visited"). */
  recordBoardVisit(userId: EntityId, boardId: EntityId): Promise<void>;
  listRecentBoardIds(userId: EntityId, limit: number): Promise<EntityId[]>;
}

export interface Repositories {
  users: UserRepository;
  workspaces: WorkspaceRepository;
  teams: TeamRepository;
  boards: BoardRepository;
  items: ItemRepository;
  comments: CommentRepository;
  activities: ActivityRepository;
  notifications: NotificationRepository;
  admin: DataAdminRepository;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`);
    this.name = "NotFoundError";
  }
}
