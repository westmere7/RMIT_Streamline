import type {
  Activity,
  ActivityEventType,
  ActivityMetadata,
  Board,
  BoardColumn,
  BoardFavourite,
  BoardGroup,
  BoardMember,
  BoardRole,
  BoardType,
  BoardVisibility,
  ColorToken,
  ColumnSettings,
  ColumnType,
  ColumnValue,
  Comment,
  DirectMessage,
  Item,
  ItemColumnValue,
  ItemLink,
  Notification,
  NotificationEntityType,
  NotificationType,
  Team,
  TeamMember,
  TeamRole,
  Tracker,
  TrackerColumn,
  TrackerRow,
  TrackerSheet,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "@/domain";

/**
 * Row shapes for `supabase/migrations/*.sql` and the mappers between them and the
 * domain. Postgres is snake_case; the domain is camelCase. JSONB columns
 * (`settings`, `value_json`, `metadata`, tracker `columns`/`rows`) hold the
 * TypeScript unions verbatim, so they only need a cast.
 */

export interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  timezone: string;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PROFILE_COLUMNS =
  "id, email, first_name, last_name, display_name, avatar_url, job_title, department, timezone, deactivated_at, created_at, updated_at";

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    jobTitle: row.job_title,
    department: row.department,
    timezone: row.timezone,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromUserPatch(patch: Partial<Omit<User, "id" | "createdAt">>): Record<string, unknown> {
  return pruneUndefined({
    email: patch.email?.toLowerCase(),
    first_name: patch.firstName,
    last_name: patch.lastName,
    display_name: patch.displayName,
    avatar_url: patch.avatarUrl,
    job_title: patch.jobTitle,
    department: patch.department,
    timezone: patch.timezone,
    deactivated_at: patch.deactivatedAt,
  });
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url, createdAt: row.created_at, updatedAt: row.updated_at };
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joined_at: string;
}

export function toWorkspaceMember(row: WorkspaceMemberRow): WorkspaceMember {
  return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, role: row.role, status: row.status, joinedAt: row.joined_at };
}

export interface TeamRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: ColorToken;
  icon: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TeamMemberRow {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
}

export function toTeamMember(row: TeamMemberRow): TeamMember {
  return { id: row.id, teamId: row.team_id, userId: row.user_id, role: row.role };
}

export interface BoardRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  type: BoardType;
  visibility: BoardVisibility;
  owner_id: string;
  color: ColorToken;
  icon: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toBoard(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    type: row.type,
    visibility: row.visibility,
    ownerId: row.owner_id,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromBoardPatch(patch: Partial<Omit<Board, "id" | "createdAt">>): Record<string, unknown> {
  return pruneUndefined({
    workspace_id: patch.workspaceId,
    team_id: patch.teamId,
    name: patch.name,
    slug: patch.slug,
    description: patch.description,
    type: patch.type,
    visibility: patch.visibility,
    owner_id: patch.ownerId,
    color: patch.color,
    icon: patch.icon,
    archived_at: patch.archivedAt,
  });
}

export interface BoardMemberRow {
  id: string;
  board_id: string;
  user_id: string;
  role: BoardRole;
}

export function toBoardMember(row: BoardMemberRow): BoardMember {
  return { id: row.id, boardId: row.board_id, userId: row.user_id, role: row.role };
}

export interface BoardFavouriteRow {
  id: string;
  board_id: string;
  user_id: string;
  created_at: string;
}

export function toBoardFavourite(row: BoardFavouriteRow): BoardFavourite {
  return { id: row.id, boardId: row.board_id, userId: row.user_id, createdAt: row.created_at };
}

export interface BoardGroupRow {
  id: string;
  board_id: string;
  name: string;
  color: ColorToken;
  position: number;
  collapsed: boolean;
  created_at: string;
}

export function toBoardGroup(row: BoardGroupRow): BoardGroup {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    color: row.color,
    position: row.position,
    collapsed: row.collapsed,
    createdAt: row.created_at,
  };
}

export function fromBoardGroupPatch(patch: Partial<Omit<BoardGroup, "id" | "boardId" | "createdAt">>): Record<string, unknown> {
  return pruneUndefined({ name: patch.name, color: patch.color, position: patch.position, collapsed: patch.collapsed });
}

export interface BoardColumnRow {
  id: string;
  board_id: string;
  name: string;
  type: ColumnType;
  settings: ColumnSettings;
  position: number;
  width: number;
  hidden: boolean;
  created_at: string;
}

export function toBoardColumn(row: BoardColumnRow): BoardColumn {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    type: row.type,
    settings: row.settings,
    position: row.position,
    width: row.width,
    hidden: row.hidden,
    createdAt: row.created_at,
  };
}

export function fromBoardColumnPatch(patch: Partial<Omit<BoardColumn, "id" | "boardId" | "createdAt">>): Record<string, unknown> {
  return pruneUndefined({
    name: patch.name,
    type: patch.type,
    settings: patch.settings,
    position: patch.position,
    width: patch.width,
    hidden: patch.hidden,
  });
}

export interface ItemRow {
  id: string;
  board_id: string;
  group_id: string;
  parent_item_id: string | null;
  name: string;
  description: string | null;
  position: number;
  created_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    boardId: row.board_id,
    groupId: row.group_id,
    parentItemId: row.parent_item_id,
    name: row.name,
    description: row.description,
    position: row.position,
    createdBy: row.created_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromItemPatch(patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">>): Record<string, unknown> {
  return pruneUndefined({
    group_id: patch.groupId,
    parent_item_id: patch.parentItemId,
    name: patch.name,
    description: patch.description,
    position: patch.position,
    created_by: patch.createdBy,
    archived_at: patch.archivedAt,
    updated_at: patch.updatedAt,
  });
}

export interface ItemColumnValueRow {
  id: string;
  item_id: string;
  column_id: string;
  value_json: ColumnValue;
  updated_at: string;
}

export function toItemColumnValue(row: ItemColumnValueRow): ItemColumnValue {
  return { id: row.id, itemId: row.item_id, columnId: row.column_id, value: row.value_json, updatedAt: row.updated_at };
}

export interface ItemLinkRow {
  id: string;
  workspace_id: string;
  item_a_id: string;
  item_b_id: string;
  excluded: string[];
  created_by: string;
  created_at: string;
}

export function toItemLink(row: ItemLinkRow): ItemLink {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    itemAId: row.item_a_id,
    itemBId: row.item_b_id,
    excluded: row.excluded ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export interface TrackerTableRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function toTracker(row: TrackerTableRow): Tracker {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TrackerSheetRow {
  id: string;
  tracker_id: string;
  name: string;
  position: number;
  columns: TrackerColumn[];
  rows: TrackerRow[];
  frozen_columns: number;
  created_at: string;
  updated_at: string;
}

export function toTrackerSheet(row: TrackerSheetRow): TrackerSheet {
  return {
    id: row.id,
    trackerId: row.tracker_id,
    name: row.name,
    position: row.position,
    columns: row.columns ?? [],
    rows: row.rows ?? [],
    frozenColumns: row.frozen_columns,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CommentRow {
  id: string;
  item_id: string;
  author_id: string;
  body: string;
  mention_user_ids: string[];
  created_at: string;
  updated_at: string;
}

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    itemId: row.item_id,
    authorId: row.author_id,
    body: row.body,
    mentionUserIds: row.mention_user_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface DirectMessageRow {
  id: string;
  workspace_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function toDirectMessage(row: DirectMessageRow): DirectMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export interface ActivityRow {
  id: string;
  workspace_id: string;
  board_id: string | null;
  item_id: string | null;
  actor_id: string;
  event_type: ActivityEventType;
  metadata: ActivityMetadata;
  created_at: string;
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    boardId: row.board_id,
    itemId: row.item_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: NotificationEntityType;
  entity_id: string;
  board_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    boardId: row.board_id,
    actorId: row.actor_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Drops keys the caller did not set, so a patch never overwrites with null by accident. */
export function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) if (value !== undefined) out[key] = value;
  return out;
}
