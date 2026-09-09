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
  CompleteOnboardingInput,
  DirectMessage,
  DirectMessageInput,
  EntityId,
  Item,
  ItemColumnValue,
  ItemInput,
  ItemLink,
  ItemLinkInput,
  InvitationPreview,
  InviteMemberInput,
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
  WorkspaceInvitation,
  WorkspaceMember,
} from "@/domain";
import type { BoardShare, BoardShareInput, ItemShare, ItemShareInput, BoardViewKind, BookingTemplate, BookingTemplateInput, DashboardShare, DashboardShareInput, ItemAsset, ItemAssetInput, ItemAssetPatch, WorkspaceListKey, WorkspaceListOption, WorkspaceListOptionInput, DepartmentPortal, DepartmentPortalInput, PortalRequest, PortalRequestInput, PortalSubmission, StakeholderDepartment, StakeholderDepartmentInput } from "@/domain";

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

/** The result of adding someone to a workspace: the person, their pending membership and the link to send them. */
export interface InviteResult {
  user: User;
  member: WorkspaceMember;
  invitation: WorkspaceInvitation;
}

/**
 * Onboarding without email. An admin adds a person (they appear as a pending
 * member straight away) and receives a unique link; opening the link lets the
 * person set a password and finish their profile, which activates them.
 *
 * Coarse-grained on purpose: with Supabase every step that touches auth
 * accounts has to run server-side with the service role, so each method is one
 * round trip there and one IndexedDB transaction locally.
 */
export interface OnboardingRepository {
  /** Creates the account (if new), the INVITED membership, team memberships and a fresh invitation. */
  invite(input: InviteMemberInput): Promise<InviteResult>;
  /** Every invitation of the workspace, live or not. Admin only. */
  listInvitations(workspaceId: EntityId): Promise<WorkspaceInvitation[]>;
  /** Revokes any live invitation for the member and issues a new one. */
  regenerate(workspaceId: EntityId, userId: EntityId): Promise<WorkspaceInvitation>;
  /** Removes a member who never finished onboarding, together with their invitations and (when unused elsewhere) their account. */
  cancel(workspaceId: EntityId, userId: EntityId): Promise<void>;
  /**
   * Sends an existing member through onboarding again: their membership goes back
   * to INVITED and a fresh link is issued. They set a new password when they open it.
   */
  reinitiate(workspaceId: EntityId, userId: EntityId): Promise<WorkspaceInvitation>;
  /** What the join page may show for a token; safe to call signed out. */
  preview(token: string): Promise<InvitationPreview>;
  /** Sets the password and profile, activates the membership and burns the token. Returns the sign-in email. */
  complete(input: CompleteOnboardingInput): Promise<{ email: string; userId: EntityId }>;
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
  getColumn(id: EntityId): Promise<BoardColumn | null>;
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
  /**
   * Writes only the pairs that have no value yet and leaves existing rows alone.
   * For defaults applied while a record is being created: a value the user set in
   * the meantime must win over the default that lands a moment later.
   */
  setValuesIfAbsent(values: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }>): Promise<ItemColumnValue[]>;
}

export interface ItemLinkRepository {
  /** Links touching the item, from either side. */
  listByItem(itemId: EntityId): Promise<ItemLink[]>;
  /** Links touching any of the items (de-duplicated). */
  listByItems(itemIds: EntityId[]): Promise<ItemLink[]>;
  /** Every link in the workspace, for reads that span every board (the dashboard). */
  listByWorkspace(workspaceId: EntityId): Promise<ItemLink[]>;
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

/**
 * The workspace's shared option lists (asset types, stakeholder groups). A list
 * nobody has edited has no rows: the domain stands the built-in defaults in for
 * it, and the first save writes the list out whole.
 */
export interface WorkspaceListRepository {
  listByWorkspace(workspaceId: EntityId): Promise<WorkspaceListOption[]>;
  /** Replaces one list with exactly these options, in this order. */
  replace(workspaceId: EntityId, listKey: WorkspaceListKey, options: WorkspaceListOptionInput[]): Promise<WorkspaceListOption[]>;
}

/**
 * Stakeholder departments, their portals, and what each portal publishes.
 *
 * Departments are reconciled from the stakeholder-groups list rather than
 * edited directly, so there is no plain `create` here: `reconcile` takes the
 * whole list plus the renames the editor recorded and settles identity in one
 * operation. See StakeholderPortalService.
 */
export interface StakeholderPortalRepository {
  listDepartments(workspaceId: EntityId, options?: { includeDisabled?: boolean }): Promise<StakeholderDepartment[]>;
  getDepartment(id: EntityId): Promise<StakeholderDepartment | null>;
  createDepartment(input: StakeholderDepartmentInput): Promise<StakeholderDepartment>;
  updateDepartment(id: EntityId, patch: Partial<Pick<StakeholderDepartment, "name" | "color" | "position" | "status">>): Promise<StakeholderDepartment>;

  listPortals(workspaceId: EntityId): Promise<DepartmentPortal[]>;
  getPortalByDepartment(departmentId: EntityId): Promise<DepartmentPortal | null>;
  /** The one lookup a visitor's request turns into. Returns null for an unknown token. */
  getPortalByToken(token: string): Promise<DepartmentPortal | null>;
  createPortal(input: DepartmentPortalInput): Promise<DepartmentPortal>;
  updatePortal(id: EntityId, patch: Partial<Pick<DepartmentPortal, "enabled" | "token" | "passwordHash" | "defaultTheme" | "credentialVersion">>): Promise<DepartmentPortal>;

  /** A department's requests, newest first, bounded and cursored for stable pagination. */
  listRequests(departmentId: EntityId, options?: { limit?: number; cursor?: string | null }): Promise<{ rows: PortalRequest[]; nextCursor: string | null }>;
  /** How many requests a department has, for the management screen's count. */
  countRequests(departmentId: EntityId): Promise<number>;
  /** The provenance of one item, if it has any. The scope check every task read starts from. */
  getRequestByItem(workspaceId: EntityId, itemId: EntityId): Promise<PortalRequest | null>;
  listRequestsByItems(workspaceId: EntityId, itemIds: readonly EntityId[]): Promise<PortalRequest[]>;
  createRequest(input: PortalRequestInput): Promise<PortalRequest>;
  updateRequest(id: EntityId, patch: Partial<Pick<PortalRequest, "departmentId" | "publicBrief">>): Promise<PortalRequest>;
  deleteRequest(id: EntityId): Promise<void>;

  /** The receipt a submission key already produced, or null when the key is new. */
  getSubmission(portalId: EntityId, submissionKey: string): Promise<PortalSubmission | null>;
  /**
   * Records a submission. Rejects a key that already exists — the unique
   * constraint is the arbiter, so two parallel retries cannot both win.
   */
  createSubmission(input: Omit<PortalSubmission, "id" | "createdAt">): Promise<PortalSubmission>;
}

export interface ItemAssetRepository {
  /** One line, or null — read before an edit so the activity feed can say what changed. */
  getById(id: EntityId): Promise<ItemAsset | null>;
  /** An item's asset lines in position order. */
  listByItem(itemId: EntityId): Promise<ItemAsset[]>;
  /** Every line on a board, for the recap cells. */
  listByBoard(boardId: EntityId): Promise<ItemAsset[]>;
  create(input: ItemAssetInput): Promise<ItemAsset>;
  update(id: EntityId, patch: ItemAssetPatch): Promise<ItemAsset>;
  delete(id: EntityId): Promise<void>;
}

/**
 * The public link of a board: at most one per board, looked up either from the
 * board (to manage it) or from the token in the link (to serve it).
 */
export interface BoardShareRepository {
  getByBoard(boardId: EntityId): Promise<BoardShare | null>;
  getByToken(token: string): Promise<BoardShare | null>;
  create(input: BoardShareInput): Promise<BoardShare>;
  update(id: EntityId, patch: Partial<Pick<BoardShare, "token" | "enabled" | "expiresAt" | "passwordHash" | "access">>): Promise<BoardShare>;
  delete(id: EntityId): Promise<void>;
}

/** The public link of one task. At most one per item; the same shape as a board's. */
export interface ItemShareRepository {
  getByItem(itemId: EntityId): Promise<ItemShare | null>;
  getByToken(token: string): Promise<ItemShare | null>;
  create(input: ItemShareInput): Promise<ItemShare>;
  update(id: EntityId, patch: Partial<Pick<ItemShare, "token" | "enabled" | "expiresAt" | "passwordHash" | "access">>): Promise<ItemShare>;
  delete(id: EntityId): Promise<void>;
}

/**
 * The public link of a workspace's dashboard: at most one per workspace, looked
 * up either from the workspace (to manage it) or from the token in the link (to
 * serve it).
 */
export interface DashboardShareRepository {
  getByWorkspace(workspaceId: EntityId): Promise<DashboardShare | null>;
  getByToken(token: string): Promise<DashboardShare | null>;
  create(input: DashboardShareInput): Promise<DashboardShare>;
  update(id: EntityId, patch: Partial<Pick<DashboardShare, "token" | "enabled" | "expiresAt" | "passwordHash">>): Promise<DashboardShare>;
  delete(id: EntityId): Promise<void>;
}

/** Saved booking forms, by name, per workspace. The live form itself lives on the workspace row. */
export interface BookingTemplateRepository {
  listByWorkspace(workspaceId: EntityId): Promise<BookingTemplate[]>;
  getById(id: EntityId): Promise<BookingTemplate | null>;
  create(input: BookingTemplateInput): Promise<BookingTemplate>;
  update(id: EntityId, patch: Partial<Pick<BookingTemplate, "name" | "template">>): Promise<BookingTemplate>;
  delete(id: EntityId): Promise<void>;
}

export interface CommentRepository {
  listByItem(itemId: EntityId): Promise<Comment[]>;
  /** Every update on any of the items, for per-item counts across a board. */
  listByItems(itemIds: EntityId[]): Promise<Comment[]>;
  /** Every copy of one update, including the one it was posted from. */
  listBySharedId(sharedId: EntityId): Promise<Comment[]>;
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

/** Per-person "last looked at this item's updates" markers. */
export interface ItemReadRepository {
  /** Item id → ISO time the person last viewed its updates. */
  listByUser(userId: EntityId): Promise<Record<EntityId, string>>;
  markSeen(userId: EntityId, itemId: EntityId, seenAt: string): Promise<void>;
}

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
  /** Marks the board as just opened; with `view`, also remembers the view this person used there. */
  recordBoardVisit(userId: EntityId, boardId: EntityId, view?: BoardViewKind): Promise<void>;
  /** The view this person last used on the board, or null when they never chose one. */
  getBoardVisitView(userId: EntityId, boardId: EntityId): Promise<BoardViewKind | null>;
  /** Per-view settings this person chose on the board, keyed by view kind. */
  getBoardViewSettings(userId: EntityId, boardId: EntityId): Promise<Record<string, unknown>>;
  /** Replaces one view's settings on the board for this person, leaving the other views' alone. */
  saveBoardViewSettings(userId: EntityId, boardId: EntityId, view: BoardViewKind, settings: Record<string, unknown>): Promise<void>;
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
  onboarding: OnboardingRepository;
  teams: TeamRepository;
  boards: BoardRepository;
  items: ItemRepository;
  links: ItemLinkRepository;
  trackers: TrackerRepository;
  comments: CommentRepository;
  itemAssets: ItemAssetRepository;
  workspaceLists: WorkspaceListRepository;
  stakeholderPortals: StakeholderPortalRepository;
  bookingTemplates: BookingTemplateRepository;
  boardShares: BoardShareRepository;
  itemShares: ItemShareRepository;
  dashboardShares: DashboardShareRepository;
  itemReads: ItemReadRepository;
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
