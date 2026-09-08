/**
 * Central TanStack Query keys. Keep every key here so invalidation stays
 * consistent and future realtime subscriptions know what to refresh.
 */
export const queryKeys = {
  session: ["session"] as const,
  currentUser: (userId: string | null) => ["current-user", userId] as const,

  workspace: (slug: string) => ["workspace", slug] as const,
  workspaceContext: (workspaceId: string) => ["workspace-context", workspaceId] as const,
  workspaceMembers: (workspaceId: string) => ["workspace-members", workspaceId] as const,
  /** Live onboarding links of a workspace, for the members page (admins only). */
  workspaceInvitations: (workspaceId: string) => ["workspace-invitations", workspaceId] as const,
  /** What a join link resolves to, before anyone is signed in. */
  invitationPreview: (token: string) => ["invitation-preview", token] as const,
  /** Accounts the local sign-in screen offers. */
  signInAccounts: ["sign-in-accounts"] as const,
  teams: (workspaceId: string) => ["teams", workspaceId] as const,

  boards: (workspaceId: string) => ["boards", workspaceId] as const,
  boardMembersAll: (workspaceId: string) => ["board-members", workspaceId] as const,
  boardMembers: (boardId: string) => ["board-members", "board", boardId] as const,
  favourites: (userId: string) => ["favourites", userId] as const,
  recentBoards: (userId: string) => ["recent-boards", userId] as const,

  board: (boardId: string) => ["board", boardId] as const,
  /** The public link of a board, for the Share dialog. */
  boardShare: (boardId: string) => ["board-share", boardId] as const,
  /** Groups, columns, items and values of a board in one snapshot. */
  boardSnapshot: (boardId: string) => ["board-snapshot", boardId] as const,
  boardGroups: (boardId: string) => ["board-groups", boardId] as const,
  boardColumns: (boardId: string) => ["board-columns", boardId] as const,
  boardItems: (boardId: string) => ["board-items", boardId] as const,

  item: (itemId: string) => ["item", itemId] as const,
  /** Linked items shown in the item panel. */
  itemLinks: (itemId: string) => ["item-links", itemId] as const,
  linkCandidates: (workspaceId: string, itemId: string, query: string, boardId: string | null) => ["link-candidates", workspaceId, itemId, query, boardId] as const,
  linkMapping: (boardId: string, otherBoardId: string) => ["link-mapping", boardId, otherBoardId] as const,
  /** An item's asset lines; the board-wide list shares the prefix so both refresh together. */
  itemAssets: (itemId: string) => ["item-assets", itemId] as const,
  boardAssets: (boardId: string) => ["item-assets", "board", boardId] as const,
  comments: (itemId: string) => ["comments", itemId] as const,
  /** Every update on a board's items, for the per-item badges. Shares the "comments" prefix so comment changes refresh it. */
  boardComments: (boardId: string) => ["comments", "board", boardId] as const,
  /** Which items the person has caught up on. */
  itemReads: (userId: string) => ["item-reads", userId] as const,
  itemActivity: (itemId: string) => ["activity", "item", itemId] as const,
  boardActivity: (boardId: string) => ["activity", "board", boardId] as const,
  workspaceActivity: (workspaceId: string) => ["activity", "workspace", workspaceId] as const,

  trackers: (workspaceId: string) => ["trackers", workspaceId] as const,
  tracker: (trackerId: string) => ["tracker", trackerId] as const,
  trackerSheets: (trackerId: string) => ["tracker-sheets", trackerId] as const,

  notifications: (userId: string) => ["notifications", userId] as const,
  notificationPreferences: (userId: string) => ["notification-preferences", userId] as const,

  profile: (workspaceId: string, userId: string) => ["profile", workspaceId, userId] as const,
  messageThreads: (workspaceId: string, userId: string) => ["message-threads", workspaceId, userId] as const,
  messageThread: (workspaceId: string, userId: string, otherUserId: string) => ["message-thread", workspaceId, userId, otherUserId] as const,
  unreadMessages: (workspaceId: string, userId: string) => ["unread-messages", workspaceId, userId] as const,
  myWork: (workspaceId: string, userId: string) => ["my-work", workspaceId, userId] as const,
  search: (workspaceId: string, query: string) => ["search", workspaceId, query] as const,
  /** The booking form's options: null key from inside the app, the link's key on the public page. */
  bookingForm: (workspaceSlug: string, key: string | null) => ["booking-form", workspaceSlug, key] as const,
  /** Every form of the workspace's saved by name, for the editor's Templates menu. */
  bookingTemplates: (workspaceId: string) => ["booking-templates", workspaceId] as const,
};
