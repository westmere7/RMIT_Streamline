import { COLUMN_ROLES, type ColumnRole } from "@/domain";
import type {
  Activity,
  ActivityEventType,
  ActivityMetadata,
  BookingFormTemplate,
  Board,
  BoardColumn,
  BoardFavourite,
  BoardGroup,
  BoardMember,
  BoardRole,
  BoardSystemKind,
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
  NotificationPreferences,
  NotificationType,
  StoredDelivery,
  Team,
  TeamMember,
  TeamRole,
  TeamSystemKind,
  Tracker,
  TrackerColumn,
  TrackerRow,
  TrackerSheet,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "@/domain";
import { defaultNotificationPreferences, normaliseAssetRates } from "@/domain";

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
  stakeholder_group: string | null;
  work_hours_start: string | null;
  work_hours_end: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PROFILE_COLUMNS =
  "id, email, first_name, last_name, display_name, avatar_url, job_title, department, timezone, stakeholder_group, work_hours_start, work_hours_end, deactivated_at, created_at, updated_at";

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
    stakeholderGroup: row.stakeholder_group ?? null,
    workHoursStart: row.work_hours_start ?? null,
    workHoursEnd: row.work_hours_end ?? null,
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
    stakeholder_group: patch.stakeholderGroup,
    work_hours_start: patch.workHoursStart,
    work_hours_end: patch.workHoursEnd,
    deactivated_at: patch.deactivatedAt,
  });
}

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  booking_key: string | null;
  booking_form: BookingFormTemplate | null;
  booking_form_draft?: BookingFormTemplate | null;
  asset_rates: unknown;
  creative_team_name: string | null;
  created_at: string;
  updated_at: string;
}

export const WORKSPACE_COLUMNS = "id, name, slug, logo_url, booking_key, booking_form, booking_form_draft, creative_team_name, asset_rates, created_at, updated_at";

export function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url, bookingKey: row.booking_key ?? null, bookingForm: row.booking_form ?? null, bookingFormDraft: row.booking_form_draft ?? null, creativeTeamName: row.creative_team_name ?? null, assetRates: normaliseAssetRates(row.asset_rates), createdAt: row.created_at, updatedAt: row.updated_at };
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

export interface WorkspaceInvitationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  token: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export const INVITATION_COLUMNS = "id, workspace_id, user_id, token, created_by, created_at, expires_at, accepted_at, revoked_at";

export function toWorkspaceInvitation(row: WorkspaceInvitationRow): WorkspaceInvitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    token: row.token,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

export interface TeamRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: ColorToken;
  icon: string;
  archived_at: string | null;
  system: TeamSystemKind | null;
  booking_board_id: string | null;
  created_at: string;
  updated_at: string;
}

export const TEAM_COLUMNS = "id, workspace_id, name, description, color, icon, archived_at, system, booking_board_id, created_at, updated_at";

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    archivedAt: row.archived_at,
    system: row.system ?? null,
    bookingBoardId: row.booking_board_id ?? null,
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
  system: BoardSystemKind | null;
  created_at: string;
  updated_at: string;
}

export const BOARD_COLUMNS = "id, workspace_id, team_id, name, slug, description, type, visibility, owner_id, color, icon, archived_at, system, created_at, updated_at";

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
    system: row.system ?? null,
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
    system: patch.system,
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
  /** Added by migration 0044; absent on a row read before it ran. */
  hidden_in_panel?: boolean;
  role?: string | null;
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
    hiddenInPanel: row.hidden_in_panel ?? false,
    role: (COLUMN_ROLES as readonly string[]).includes(row.role ?? "") ? (row.role as ColumnRole) : null,
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
    hidden_in_panel: patch.hiddenInPanel,
    role: patch.role,
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
  cover_url?: string | null;
  reference?: string | null;
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
    coverUrl: row.cover_url ?? null,
    reference: row.reference ?? null,
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
    cover_url: patch.coverUrl,
    reference: patch.reference,
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
  pairs?: [string, string][];
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
    pairs: (row.pairs ?? []).filter((p): p is [string, string] => Array.isArray(p) && p.length === 2),
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
  shared_id: string | null;
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
    sharedId: row.shared_id ?? null,
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
  delivery: StoredDelivery | null;
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
    // Rows written before deliveries existed were the loud kind.
    delivery: row.delivery ?? "NOTIFICATION",
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

export interface NotificationPreferencesRow {
  user_id: string;
  types: Record<string, string> | null;
  muted_board_ids: string[] | null;
  browser_enabled: boolean | null;
  updated_at: string;
}

export function toNotificationPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  const base = defaultNotificationPreferences(row.user_id);
  return {
    userId: row.user_id,
    types: { ...base.types, ...((row.types ?? {}) as NotificationPreferences["types"]) },
    mutedBoardIds: row.muted_board_ids ?? [],
    browserEnabled: row.browser_enabled ?? false,
    updatedAt: row.updated_at,
  };
}

/** Drops keys the caller did not set, so a patch never overwrites with null by accident. */
export function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) if (value !== undefined) out[key] = value;
  return out;
}
