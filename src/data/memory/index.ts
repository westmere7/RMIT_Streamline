import type { ArchivePage, ArchiveQuery, Item, ItemColumnValue, PublicBoardPayload, User, Workspace } from "@/domain";
import { compareArchived, matchesArchiveQuery } from "@/domain";
import type { Repositories } from "@/data/repositories";

/**
 * The repositories a shared board is read through.
 *
 * A public link hands the visitor one payload (PublicBoardPayload) and nothing
 * else. Wrapping it in the ordinary repository interface means every view, cell
 * and panel in the app works unchanged on a page with no account behind it: the
 * services above them cannot tell the difference.
 *
 * Reads answer from the payload, and anything outside it comes back empty
 * rather than reaching for a server that would refuse anyway. Writes throw,
 * except the two the app performs by itself when a page opens — marking an item
 * seen and recording a visit — which are quietly dropped.
 *
 * `source` is read on every call rather than captured, so the page can refresh
 * the payload underneath and the next read answers from the newer board.
 */
export function createMemoryRepositories(source: PublicBoardPayload | (() => PublicBoardPayload)): Repositories {
  const payload = (): PublicBoardPayload => (typeof source === "function" ? source() : source);
  const board = () => payload().board;
  const usersById = () => new Map(payload().users.map((u) => [u.id, u]));
  const workspace = (): Workspace => ({
    id: board().workspaceId,
    name: payload().workspaceName,
    slug: "",
    logoUrl: null,
    bookingKey: null,
    bookingForm: null,
    createdAt: board().createdAt,
    updatedAt: board().updatedAt,
  });

  const onBoard = (id: string) => id === board().id;
  const items = (boardId: string): Item[] => (onBoard(boardId) ? payload().items : []);
  const values = (boardId: string): ItemColumnValue[] => (onBoard(boardId) ? payload().values : []);

  return {
    users: {
      list: async () => payload().users,
      getById: async (id) => usersById().get(id) ?? null,
      getByEmail: async () => null,
      create: readOnly("adding people"),
      update: readOnly("editing a profile"),
    },
    workspaces: {
      list: async () => [workspace()],
      getById: async (id) => (id === workspace().id ? workspace() : null),
      getBySlug: async () => null,
      update: readOnly("editing the workspace"),
      listMembers: async () => [],
      listMembershipsForUser: async () => [],
      addMember: readOnly("adding a member"),
      updateMember: readOnly("changing a member"),
      removeMember: readOnly("removing a member"),
    },
    onboarding: {
      invite: readOnly("inviting people"),
      listInvitations: async () => [],
      regenerate: readOnly("issuing an invitation"),
      cancel: readOnly("cancelling an invitation"),
      reinitiate: readOnly("re-inviting someone"),
      preview: readOnly("opening an invitation"),
      complete: readOnly("finishing onboarding"),
    },
    teams: {
      listByWorkspace: async () => [],
      getById: async () => null,
      create: readOnly("creating a team"),
      update: readOnly("editing a team"),
      delete: readOnly("deleting a team"),
      listMembersByWorkspace: async () => [],
      listMembers: async () => [],
      addMember: readOnly("adding someone to a team"),
      removeMember: readOnly("removing someone from a team"),
    },
    boards: {
      listByWorkspace: async () => [board()],
      getById: async (id) => (onBoard(id) ? board() : null),
      getBySlug: async (_workspaceId, slug) => (slug === board().slug ? board() : null),
      create: readOnly("creating a board"),
      update: readOnly("editing this board"),
      delete: readOnly("deleting this board"),
      listMembers: async () => [],
      listMembersByWorkspace: async () => [],
      setMember: readOnly("changing who is on this board"),
      removeMember: readOnly("changing who is on this board"),
      listFavourites: async () => [],
      addFavourite: readOnly("saving a favourite"),
      removeFavourite: readOnly("saving a favourite"),
      listGroups: async (boardId) => (onBoard(boardId) ? payload().groups : []),
      getGroup: async (id) => payload().groups.find((g) => g.id === id) ?? null,
      createGroup: readOnly("adding a group"),
      updateGroup: readOnly("editing a group"),
      deleteGroup: readOnly("deleting a group"),
      reorderGroups: readOnly("reordering groups"),
      listColumns: async (boardId) => (onBoard(boardId) ? payload().columns : []),
      getColumn: async (id) => payload().columns.find((c) => c.id === id) ?? null,
      createColumn: readOnly("adding a column"),
      updateColumn: readOnly("editing a column"),
      deleteColumn: readOnly("deleting a column"),
      reorderColumns: readOnly("reordering columns"),
    },
    items: {
      listByBoard: async (boardId) => items(boardId),
      // A shared board carries no archive, but the payload behind a dashboard
      // does; answering from it costs nothing and keeps the interface honest.
      listArchivedPage: async (query: ArchiveQuery): Promise<ArchivePage<Item>> => {
        const valuesByItem = new Map(values(query.boardId).map((v) => [`${v.itemId}:${v.columnId}`, v.value]));
        const matched = items(query.boardId)
          .filter((i) => i.archivedAt !== null && i.parentItemId === null)
          .filter((i) => matchesArchiveQuery(i, query, (itemId, columnId) => valuesByItem.get(`${itemId}:${columnId}`)))
          .sort((a, b) => compareArchived(a, b, query.sort));
        return { rows: matched.slice(query.offset, query.offset + query.limit), total: matched.length };
      },
      countArchived: async (boardId) => items(boardId).filter((i) => i.archivedAt !== null && i.parentItemId === null).length,
      listByIds: async (ids) => payload().items.filter((i) => ids.includes(i.id)),
      getById: async (id) => payload().items.find((i) => i.id === id) ?? null,
      create: readOnly("adding an item"),
      update: readOnly("editing an item"),
      updateMany: readOnly("editing items"),
      moveToBoard: readOnly("moving an item to another board"),
      deleteMany: readOnly("deleting items"),
      listValuesByBoard: async (boardId) => values(boardId),
      listValuesByItem: async (itemId) => payload().values.filter((v) => v.itemId === itemId),
      listValuesByItems: async (itemIds) => payload().values.filter((v) => itemIds.includes(v.itemId)),
      listValuesByColumns: async (columnIds) => payload().values.filter((v) => columnIds.includes(v.columnId)),
      setValue: readOnly("editing a cell"),
      setValues: readOnly("editing cells"),
      setValuesIfAbsent: readOnly("editing cells"),
    },
    links: {
      listByItem: async (itemId) => payload().links.filter((l) => l.itemAId === itemId || l.itemBId === itemId),
      listByItems: async (ids) => payload().links.filter((l) => ids.includes(l.itemAId) || ids.includes(l.itemBId)),
      listByWorkspace: async () => payload().links,
      getById: async (id) => payload().links.find((l) => l.id === id) ?? null,
      create: readOnly("linking items"),
      update: readOnly("editing a link"),
      delete: readOnly("removing a link"),
    },
    trackers: {
      listByWorkspace: async () => [],
      getById: async () => null,
      create: readOnly("creating a tracker"),
      update: readOnly("editing a tracker"),
      delete: readOnly("deleting a tracker"),
      listSheets: async () => [],
      getSheet: async () => null,
      createSheet: readOnly("adding a sheet"),
      updateSheet: readOnly("editing a sheet"),
      deleteSheet: readOnly("deleting a sheet"),
      reorderSheets: readOnly("reordering sheets"),
    },
    comments: {
      listByItem: async (itemId) => payload().comments.filter((c) => c.itemId === itemId),
      listByItems: async (ids) => payload().comments.filter((c) => ids.includes(c.itemId)),
      listBySharedId: async (sharedId) => payload().comments.filter((c) => c.sharedId === sharedId),
      create: readOnly("posting an update"),
      update: readOnly("editing an update"),
      delete: readOnly("deleting an update"),
    },
    workspaceLists: {
      // A shared board is read with the built-in lists; nobody is signed in to edit them.
      listByWorkspace: async () => [],
      replace: readOnly("editing a list"),
    },
    // A shared board payload carries no portal, and this adapter must never be
    // able to reach one: a portal's reads are assembled server-side behind their
    // own gate, and every write here refuses.
    stakeholderPortals: {
      listDepartments: async () => [],
      getDepartment: async () => null,
      createDepartment: readOnly("creating a department"),
      updateDepartment: readOnly("editing a department"),
      listPortals: async () => [],
      getPortalByDepartment: async () => null,
      getPortalByToken: async () => null,
      createPortal: readOnly("creating a portal"),
      updatePortal: readOnly("editing a portal"),
      listRequests: async () => ({ rows: [], nextCursor: null }),
      countRequests: async () => 0,
      getRequestByItem: async () => null,
      listRequestsByItems: async () => [],
      createRequest: readOnly("publishing a request"),
      updateRequest: readOnly("moving a request"),
      deleteRequest: readOnly("unpublishing a request"),
      getSubmission: async () => null,
      createSubmission: readOnly("recording a submission"),
      completeSubmission: readOnly("recording a submission"),
      deleteSubmission: readOnly("recording a submission"),
    },
    itemAssets: {
      getById: async (id) => payload().assets.find((a) => a.id === id) ?? null,
      listByItem: async (itemId) => payload().assets.filter((a) => a.itemId === itemId).sort((a, b) => a.position - b.position),
      listByBoard: async (boardId) => (onBoard(boardId) ? payload().assets : []),
      create: readOnly("adding an asset"),
      update: readOnly("editing an asset"),
      delete: readOnly("deleting an asset"),
    },
    bookingTemplates: {
      listByWorkspace: async () => [],
      getById: async () => null,
      create: readOnly("saving a form"),
      update: readOnly("saving a form"),
      delete: readOnly("deleting a form"),
    },
    itemShares: {
      getByItem: async () => null,
      getByToken: async () => null,
      create: readOnly("sharing a task"),
      update: readOnly("changing a link"),
      delete: readOnly("removing a link"),
    },
    boardShares: {
      getByBoard: async () => null,
      getByToken: async () => null,
      create: readOnly("sharing a board"),
      update: readOnly("changing a link"),
      delete: readOnly("removing a link"),
    },
    dashboardShares: {
      getByWorkspace: async () => null,
      getByToken: async () => null,
      create: readOnly("sharing the dashboard"),
      update: readOnly("changing a link"),
      delete: readOnly("removing a link"),
    },
    itemReads: {
      listByUser: async () => ({}),
      // A visitor has nowhere to keep this, and nothing on the page shows it.
      markSeen: async () => undefined,
    },
    messages: {
      listThread: async () => [],
      listForUser: async () => [],
      create: readOnly("sending a message"),
      markThreadRead: async () => undefined,
      delete: readOnly("deleting a message"),
    },
    activities: {
      listByWorkspace: async () => [],
      listByBoard: async (boardId, limit) => (onBoard(boardId) ? payload().activities.slice(0, limit) : []),
      listByItem: async (itemId) => payload().activities.filter((a) => a.itemId === itemId),
      create: readOnly("recording activity"),
      createMany: readOnly("recording activity"),
    },
    notifications: {
      listByUser: async () => [],
      create: readOnly("notifying someone"),
      createMany: readOnly("notifying someone"),
      markRead: readOnly("reading a notification"),
      // A guest behind a share link has no notifications, so both of these are
      // trivially already done rather than refusals.
      markAllRead: async () => undefined,
      deleteAll: async () => undefined,
    },
    notificationPreferences: {
      get: async () => null,
      save: readOnly("changing notification settings"),
      getMany: async () => new Map(),
    },
    admin: {
      resetToSeed: readOnly("resetting the demo data"),
      // The visit is worth nothing to a visitor and there is no account to hang it on.
      recordBoardVisit: async () => undefined,
      getBoardVisitView: async () => null,
      getBoardViewSettings: async () => ({}),
      saveBoardViewSettings: async () => undefined,
      listRecentBoardIds: async () => [],
      exportAll: readOnly("exporting data"),
      importAll: readOnly("importing data"),
    },
  };
}

/** The person a shared board is rendered for: present enough to render, able to do nothing. */
export function shareGuestUser(): User {
  const now = new Date(0).toISOString();
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "",
    firstName: "Guest",
    lastName: "",
    displayName: "Guest",
    avatarUrl: null,
    jobTitle: null,
    department: null,
    timezone: "Australia/Melbourne",
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Everything a visitor cannot do says so in the same words. It rejects rather
 * than throwing outright, so a stray call surfaces as a failed mutation with a
 * message rather than tearing down the page.
 */
function readOnly(what: string): () => Promise<never> {
  return async () => {
    throw new Error(`This board was shared as a read-only link, so ${what} is not possible here.`);
  };
}
