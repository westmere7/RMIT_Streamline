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
  teams: (workspaceId: string) => ["teams", workspaceId] as const,

  boards: (workspaceId: string) => ["boards", workspaceId] as const,
  boardMembersAll: (workspaceId: string) => ["board-members", workspaceId] as const,
  boardMembers: (boardId: string) => ["board-members", "board", boardId] as const,
  favourites: (userId: string) => ["favourites", userId] as const,
  recentBoards: (userId: string) => ["recent-boards", userId] as const,

  board: (boardId: string) => ["board", boardId] as const,
  /** Groups, columns, items and values of a board in one snapshot. */
  boardSnapshot: (boardId: string) => ["board-snapshot", boardId] as const,
  boardGroups: (boardId: string) => ["board-groups", boardId] as const,
  boardItems: (boardId: string) => ["board-items", boardId] as const,

  item: (itemId: string) => ["item", itemId] as const,
  /** Linked items shown in the item panel. */
  itemLinks: (itemId: string) => ["item-links", itemId] as const,
  linkCandidates: (workspaceId: string, itemId: string, query: string, boardId: string | null) => ["link-candidates", workspaceId, itemId, query, boardId] as const,
  linkMapping: (boardId: string, otherBoardId: string) => ["link-mapping", boardId, otherBoardId] as const,
  comments: (itemId: string) => ["comments", itemId] as const,
  itemActivity: (itemId: string) => ["activity", "item", itemId] as const,
  boardActivity: (boardId: string) => ["activity", "board", boardId] as const,
  workspaceActivity: (workspaceId: string) => ["activity", "workspace", workspaceId] as const,

  notifications: (userId: string) => ["notifications", userId] as const,
  myWork: (workspaceId: string, userId: string) => ["my-work", workspaceId, userId] as const,
  search: (workspaceId: string, query: string) => ["search", workspaceId, query] as const,
};
