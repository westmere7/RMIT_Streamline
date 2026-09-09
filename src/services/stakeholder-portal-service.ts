import type {
  ColumnValue,
  DepartmentPortal,
  DepartmentStatus,
  EntityId,
  Item,
  ItemAsset,
  PortalContext,
  PortalGate,
  PortalRefusal,
  PortalRequest,
  PortalTask,
  PortalTaskDetail,
  PortalTaskPage,
  PortalTheme,
  StakeholderDepartment,
  TagOption,
  User,
} from "@/domain";
import {
  generatePortalToken,
  isPlausiblePortalToken,
  MAX_PUBLIC_BRIEF,
  PORTAL_PAGE_SIZE,
  reconcileDepartments,
  toTagOptions,
  WORKSPACE_LIST_META,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import { hashPortalPassword, verifyPortalPassword } from "@/lib/auth/portal-password";
import { todayISO } from "@/lib/dates/dates";
import {
  matchesPortalSearch,
  projectDeliverable,
  projectStatus,
  projectSubitem,
  projectTask,
  summarise,
  type BoardContext,
  type ProjectionContext,
} from "./portal/portal-projection";

/**
 * Why a visitor was turned away. The message never distinguishes a token that
 * names nothing from one that names another department's portal: telling those
 * apart would let anyone enumerate the workspace's departments.
 */
export class PortalAccessError extends Error {
  constructor(
    readonly reason: PortalRefusal,
    message: string,
  ) {
    super(message);
    this.name = "PortalAccessError";
  }
}

export function portalAccessMessage(reason: PortalRefusal): string {
  switch (reason) {
    case "password":
      return "That password does not open this portal.";
    case "off":
      return "This portal has been turned off. Ask the creative team for a new link.";
    case "revoked":
      return "This link has been replaced. Ask the creative team for the current one.";
    default:
      return "This link does not open a portal. Check that you copied all of it.";
  }
}

/** A grant the visitor presents on each call: which portal, and under which credentials. */
export interface PortalGrant {
  token: string;
  password: string | null;
  /** The version the grant was issued under. A stale one is refused. */
  credentialVersion?: number;
}

/** Who is asking, when anyone is. Resolved from a real session, never from the body. */
export interface PortalViewer {
  userId: EntityId;
  displayName: string;
  /** True only for an ACTIVE membership of the portal's own workspace. */
  isWorkspaceMember: boolean;
}

/** A portal resolved and admitted: everything scoped work needs, and nothing more. */
export interface ResolvedPortal {
  portal: DepartmentPortal;
  department: StakeholderDepartment;
  workspaceId: EntityId;
}

export interface DepartmentOverview {
  department: StakeholderDepartment;
  portal: DepartmentPortal | null;
  /** Canonical requests, so the number matches what the portal lists. */
  requestCount: number;
}

/**
 * The stakeholder portal.
 *
 * Two audiences and one rule between them. Administrators shape departments and
 * their links; stakeholders read one department's requests through a token. The
 * rule is that nothing about the second audience is decided by anything the
 * second audience sends: the department comes from the token, the scope comes
 * from `portal_requests`, and every field a visitor receives is written out by
 * name in the projection rather than subtracted from a row.
 */
export class StakeholderPortalService {
  constructor(private readonly repos: Repositories) {}

  // ---- departments ---------------------------------------------------------

  async departments(workspaceId: EntityId, options: { includeDisabled?: boolean } = {}): Promise<StakeholderDepartment[]> {
    return this.repos.stakeholderPortals.listDepartments(workspaceId, options);
  }

  /**
   * Brings the department table in line with the stakeholder-groups list.
   *
   * Called from WorkspaceListService whenever that list is saved, which is what
   * keeps the two from drifting: there is one editing surface, and it settles
   * both in the same operation. The decisions are made by `reconcileDepartments`
   * — a pure function, tested on its own — and applied here.
   */
  async syncDepartments(workspaceId: EntityId, options: readonly TagOption[], renames: Readonly<Record<string, string>> = {}): Promise<StakeholderDepartment[]> {
    const existing = await this.repos.stakeholderPortals.listDepartments(workspaceId, { includeDisabled: true });
    const plan = reconcileDepartments(existing, options, renames);

    for (const patch of plan.update) {
      const { id, ...rest } = patch;
      await this.repos.stakeholderPortals.updateDepartment(id, rest);
    }
    for (const id of plan.disable) {
      // Disabled, never deleted: the requests attached to it keep their
      // provenance, and its link simply stops opening.
      await this.repos.stakeholderPortals.updateDepartment(id, { status: "DISABLED" satisfies DepartmentStatus });
    }
    for (const create of plan.create) {
      await this.repos.stakeholderPortals.createDepartment({ workspaceId, ...create });
    }
    return this.repos.stakeholderPortals.listDepartments(workspaceId);
  }

  /**
   * The workspace's departments, materialised.
   *
   * A workspace that has never opened Settings → Lists has stakeholder groups
   * only in the domain's defaults, so the first time anything needs a department
   * with an id, the defaults are written out.
   */
  async ensureDepartments(workspaceId: EntityId): Promise<StakeholderDepartment[]> {
    const existing = await this.repos.stakeholderPortals.listDepartments(workspaceId);
    if (existing.length > 0) return existing;
    const stored = (await this.repos.workspaceLists.listByWorkspace(workspaceId)).filter((row) => row.listKey === "STAKEHOLDER_GROUPS");
    const options = stored.length > 0 ? toTagOptions(stored) : WORKSPACE_LIST_META.STAKEHOLDER_GROUPS.defaults;
    return this.syncDepartments(workspaceId, options);
  }

  // ---- managing a portal ----------------------------------------------------

  /** Every department with its link and its request count, for the management screen. */
  async overview(workspaceId: EntityId): Promise<DepartmentOverview[]> {
    const departments = await this.ensureDepartments(workspaceId);
    const portals = await this.repos.stakeholderPortals.listPortals(workspaceId);
    const byDepartment = new Map(portals.map((portal) => [portal.departmentId, portal]));
    return Promise.all(
      departments.map(async (department) => ({
        department,
        portal: byDepartment.get(department.id) ?? null,
        requestCount: await this.repos.stakeholderPortals.countRequests(department.id),
      })),
    );
  }

  /** The portal for a department, made on first use. Created switched off. */
  async ensurePortal(workspaceId: EntityId, departmentId: EntityId): Promise<DepartmentPortal> {
    const existing = await this.repos.stakeholderPortals.getPortalByDepartment(departmentId);
    if (existing) return existing;
    const department = await this.requireDepartment(workspaceId, departmentId);
    return this.repos.stakeholderPortals.createPortal({
      workspaceId: department.workspaceId,
      departmentId: department.id,
      // Off until somebody deliberately turns it on: creating a department must
      // never publish anything by itself.
      enabled: false,
      token: generatePortalToken(),
      passwordHash: null,
      defaultTheme: "system",
    });
  }

  async setEnabled(workspaceId: EntityId, departmentId: EntityId, enabled: boolean): Promise<DepartmentPortal> {
    const portal = await this.ensurePortal(workspaceId, departmentId);
    return this.repos.stakeholderPortals.updatePortal(portal.id, { enabled });
  }

  async setTheme(workspaceId: EntityId, departmentId: EntityId, defaultTheme: PortalTheme): Promise<DepartmentPortal> {
    const portal = await this.ensurePortal(workspaceId, departmentId);
    return this.repos.stakeholderPortals.updatePortal(portal.id, { defaultTheme });
  }

  /**
   * A new link. The old one stops working immediately, and so does every grant
   * issued under it — the version bump is what reaches a tab that is already
   * open.
   */
  async regenerateLink(workspaceId: EntityId, departmentId: EntityId): Promise<DepartmentPortal> {
    const portal = await this.ensurePortal(workspaceId, departmentId);
    return this.repos.stakeholderPortals.updatePortal(portal.id, { token: generatePortalToken(), credentialVersion: portal.credentialVersion + 1 });
  }

  /** Sets or clears the password. Either way, previous grants die with the version. */
  async setPassword(workspaceId: EntityId, departmentId: EntityId, password: string | null): Promise<DepartmentPortal> {
    const portal = await this.ensurePortal(workspaceId, departmentId);
    const passwordHash = password && password.length > 0 ? await hashPortalPassword(password) : null;
    return this.repos.stakeholderPortals.updatePortal(portal.id, { passwordHash, credentialVersion: portal.credentialVersion + 1 });
  }

  // ---- the gate -------------------------------------------------------------

  /**
   * What a visitor learns before they are admitted.
   *
   * A closed portal answers the same way as a token that names nothing, so the
   * shape of the reply cannot be used to discover which departments exist. What
   * a live portal gives away — its own name and the team's — is what the person
   * holding the link already knows.
   */
  async gate(token: string): Promise<PortalGate> {
    const closed: PortalGate = {
      open: false,
      refusal: "unknown",
      needsPassword: false,
      departmentName: "",
      creativeTeamName: "",
      defaultTheme: "system",
      credentialVersion: 0,
    };
    const portal = isPlausiblePortalToken(token) ? await this.repos.stakeholderPortals.getPortalByToken(token) : null;
    if (!portal) return closed;
    const department = await this.repos.stakeholderPortals.getDepartment(portal.departmentId);
    if (!department || department.status !== "ACTIVE" || !portal.enabled) return { ...closed, refusal: "off" };
    const workspace = await this.repos.workspaces.getById(portal.workspaceId);
    return {
      open: true,
      refusal: null,
      needsPassword: !!portal.passwordHash,
      departmentName: department.name,
      creativeTeamName: workspace?.creativeTeamName?.trim() || workspace?.name || "",
      defaultTheme: portal.defaultTheme,
      credentialVersion: portal.credentialVersion,
    };
  }

  /**
   * Admits a visitor, or throws.
   *
   * Every scoped call starts here — list, search, detail, booking, comment,
   * asset edit — so there is exactly one place the token, the switch, the
   * credential version and the password are checked, and no endpoint can be
   * written that forgets one of them.
   */
  async resolve(grant: PortalGrant): Promise<ResolvedPortal> {
    const portal = isPlausiblePortalToken(grant.token) ? await this.repos.stakeholderPortals.getPortalByToken(grant.token) : null;
    if (!portal) throw new PortalAccessError("unknown", portalAccessMessage("unknown"));
    if (!portal.enabled) throw new PortalAccessError("off", portalAccessMessage("off"));

    const department = await this.repos.stakeholderPortals.getDepartment(portal.departmentId);
    if (!department || department.status !== "ACTIVE") throw new PortalAccessError("off", portalAccessMessage("off"));

    // A grant that names an older version was issued before the link or the
    // password changed, and is dead however valid it once was.
    if (grant.credentialVersion !== undefined && grant.credentialVersion !== portal.credentialVersion) {
      throw new PortalAccessError("revoked", portalAccessMessage("revoked"));
    }
    if (portal.passwordHash) {
      const ok = !!grant.password && (await verifyPortalPassword(grant.password, portal.passwordHash));
      if (!ok) throw new PortalAccessError("password", portalAccessMessage("password"));
    }
    return { portal, department, workspaceId: portal.workspaceId };
  }

  async context(resolved: ResolvedPortal, viewer: PortalViewer | null): Promise<PortalContext> {
    const workspace = await this.repos.workspaces.getById(resolved.workspaceId);
    return {
      departmentName: resolved.department.name,
      departmentColor: resolved.department.color,
      creativeTeamName: workspace?.creativeTeamName?.trim() || workspace?.name || "",
      defaultTheme: resolved.portal.defaultTheme,
      signedIn: !!viewer,
      viewerName: viewer?.displayName ?? null,
    };
  }

  // ---- reading a department's work -------------------------------------------

  /**
   * One page of a department's requests, with figures over the whole set.
   *
   * The provenance rows are the scope, and they are read first: the boards and
   * items that follow are only those the provenance already named. Nothing here
   * scans the workspace and filters afterwards.
   *
   * Totals are computed over every authorised request, not the page, because
   * "14 overdue" has to mean the department's fourteen and not this page's.
   */
  async tasks(resolved: ResolvedPortal, options: { cursor?: string | null; limit?: number; search?: string } = {}): Promise<PortalTaskPage> {
    const limit = Math.max(1, Math.min(options.limit ?? PORTAL_PAGE_SIZE, 200));
    // Every request in the department, for the totals and the search. Bounded by
    // the department, which is the smallest scope there is.
    const all = await this.allRequests(resolved.department.id);
    const ctx = await this.projectionContext(resolved, all);
    const projected = all
      .map((request) => {
        const item = ctx.itemsById.get(request.itemId);
        return item ? { request, task: projectTask(item, ctx.projection) } : null;
      })
      .filter((entry): entry is { request: PortalRequest; task: PortalTask } => !!entry);

    const search = options.search?.trim() ?? "";
    const matching = search ? projected.filter((entry) => matchesPortalSearch(entry.task, entry.request.publicBrief, search)) : projected;
    const totals = summarise(
      matching.map((entry) => entry.task),
      ctx.projection.today,
    );

    const after = options.cursor ? matching.findIndex((entry) => cursorOf(entry.request) === options.cursor) : -1;
    const start = after >= 0 ? after + 1 : 0;
    const page = matching.slice(start, start + limit);
    const nextCursor = start + limit < matching.length && page.length > 0 ? cursorOf(page[page.length - 1]!.request) : null;

    return { tasks: page.map((entry) => entry.task), nextCursor, totals, servedAt: new Date().toISOString() };
  }

  /**
   * One request, opened.
   *
   * The item id is checked against this department's provenance before anything
   * is read, so a tampered id resolves to nothing rather than to another
   * department's work. `canAct` says whether this visitor may comment or edit
   * assets on this concrete task; it is computed, never taken from the request.
   */
  async task(resolved: ResolvedPortal, itemId: EntityId, viewer: PortalViewer | null): Promise<PortalTaskDetail> {
    const request = await this.repos.stakeholderPortals.getRequestByItem(resolved.workspaceId, itemId);
    if (!request || request.departmentId !== resolved.department.id) {
      throw new PortalAccessError("unknown", "That request is not part of this portal.");
    }
    const ctx = await this.projectionContext(resolved, [request]);
    const item = ctx.itemsById.get(itemId);
    if (!item) throw new PortalAccessError("unknown", "That request is no longer available.");

    const base = projectTask(item, ctx.projection);
    const assets = ctx.projection.assetsByItem.get(itemId) ?? [];
    const subitems = ctx.projection.subitemsByParent.get(itemId) ?? [];
    const linked = await this.linkedSummaries(resolved, item, ctx);

    return {
      ...base,
      brief: request.publicBrief,
      fullDeliverables: assets.map((asset) => projectDeliverable(asset, ctx.projection.usersById)),
      fullSubitems: subitems.map((sub) => projectSubitem(sub, ctx.projection)),
      linked,
      canAct: await this.canAct(resolved, itemId, viewer),
    };
  }

  /**
   * Whether this visitor may write on this concrete task.
   *
   * Three things have to hold, and each is checked against the real thing rather
   * than anything the caller said: a session, an active membership of the
   * task's own workspace, and an editor's or owner's role on the task's own
   * board. A stakeholder holding a valid link has none of these and gets false,
   * which is the ordinary case.
   */
  async canAct(resolved: ResolvedPortal, itemId: EntityId, viewer: PortalViewer | null): Promise<boolean> {
    if (!viewer || !viewer.isWorkspaceMember) return false;
    const item = await this.repos.items.getById(itemId);
    if (!item) return false;
    const board = await this.repos.boards.getById(item.boardId);
    if (!board || board.workspaceId !== resolved.workspaceId) return false;
    if (board.ownerId === viewer.userId) return true;
    const members = await this.repos.boards.listMembers(board.id);
    const role = members.find((member) => member.userId === viewer.userId)?.role ?? null;
    return role === "OWNER" || role === "EDITOR";
  }

  // ---- provenance ------------------------------------------------------------

  /** Attaches a task to a department. The only way anything becomes visible. */
  async associate(input: { workspaceId: EntityId; departmentId: EntityId; itemId: EntityId; source: PortalRequest["source"]; publicBrief: string | null; bookedAt?: string }): Promise<PortalRequest> {
    const department = await this.requireDepartment(input.workspaceId, input.departmentId);
    const item = await this.repos.items.getById(input.itemId);
    if (!item) throw new Error("That task no longer exists.");
    const board = await this.repos.boards.getById(item.boardId);
    if (!board || board.workspaceId !== input.workspaceId) throw new Error("That task belongs to another workspace.");
    return this.repos.stakeholderPortals.createRequest({
      workspaceId: department.workspaceId,
      departmentId: department.id,
      itemId: item.id,
      source: input.source,
      publicBrief: input.publicBrief ? input.publicBrief.slice(0, MAX_PUBLIC_BRIEF) : null,
      bookedAt: input.bookedAt,
    });
  }

  // ---- internals --------------------------------------------------------------

  private async requireDepartment(workspaceId: EntityId, departmentId: EntityId): Promise<StakeholderDepartment> {
    const department = await this.repos.stakeholderPortals.getDepartment(departmentId);
    if (!department || department.workspaceId !== workspaceId) throw new Error("That department is not part of this workspace.");
    return department;
  }

  /** Every provenance row for a department, walked in pages so nothing is unbounded. */
  private async allRequests(departmentId: EntityId): Promise<PortalRequest[]> {
    const rows: PortalRequest[] = [];
    let cursor: string | null = null;
    // A department with more than this has a reporting problem, not a portal
    // problem; the cap is here so one call cannot walk forever.
    for (let page = 0; page < 40; page++) {
      const result: { rows: PortalRequest[]; nextCursor: string | null } = await this.repos.stakeholderPortals.listRequests(departmentId, { limit: 200, cursor });
      rows.push(...result.rows);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return rows;
  }

  /**
   * Everything the projection needs, read board by board rather than item by
   * item — the difference between one round trip per board and one per request.
   */
  private async projectionContext(resolved: ResolvedPortal, requests: readonly PortalRequest[]) {
    const items = (await Promise.all(requests.map((request) => this.repos.items.getById(request.itemId)))).filter((item): item is Item => !!item);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const boardIds = [...new Set(items.map((item) => item.boardId))];

    const boards = new Map<string, BoardContext>();
    const assetsByItem = new Map<string, ItemAsset[]>();
    const subitemsByParent = new Map<string, Item[]>();
    const wanted = new Set(items.map((item) => item.id));

    for (const boardId of boardIds) {
      const board = await this.repos.boards.getById(boardId);
      if (!board) continue;
      const [columns, values, boardItems, assets] = await Promise.all([
        this.repos.boards.listColumns(boardId),
        this.repos.items.listValuesByBoard(boardId),
        this.repos.items.listByBoard(boardId),
        this.repos.itemAssets.listByBoard(boardId),
      ]);
      const valueMap = new Map<string, Map<string, ColumnValue>>();
      for (const value of values) {
        let bucket = valueMap.get(value.itemId);
        if (!bucket) {
          bucket = new Map();
          valueMap.set(value.itemId, bucket);
        }
        bucket.set(value.columnId, value.value);
      }
      boards.set(boardId, { board, columns, values: valueMap });

      for (const candidate of boardItems) {
        // Subitems of a published request travel; every other item on the board
        // is none of this department's business.
        if (candidate.parentItemId && wanted.has(candidate.parentItemId)) {
          subitemsByParent.set(candidate.parentItemId, [...(subitemsByParent.get(candidate.parentItemId) ?? []), candidate]);
          // A subitem's own status is read through its board, so it needs to be
          // resolvable too.
          itemsById.set(candidate.id, candidate);
        }
      }
      for (const asset of assets) {
        if (!wanted.has(asset.itemId)) continue;
        assetsByItem.set(asset.itemId, [...(assetsByItem.get(asset.itemId) ?? []), asset]);
      }
    }

    const links = await this.repos.links.listByItems([...wanted]);
    const linkCountByItem = new Map<string, number>();
    for (const link of links) {
      for (const id of [link.itemAId, link.itemBId]) {
        if (wanted.has(id)) linkCountByItem.set(id, (linkCountByItem.get(id) ?? 0) + 1);
      }
    }

    const usersById = new Map<string, User>((await this.repos.users.list()).map((user) => [user.id, user]));
    const projection: ProjectionContext = {
      boards,
      usersById,
      assetsByItem,
      subitemsByParent,
      linkCountByItem,
      bookedAtByItem: new Map(requests.map((request) => [request.itemId, request.bookedAt])),
      // A board's name says which team is doing the work, which is what the
      // stakeholder asked for. It is a board name, not its contents.
      publishSourceName: true,
      today: todayISO(),
    };
    return { itemsById, projection };
  }

  /**
   * The work linked to a request, as much of it as this department may know.
   *
   * A link is followed exactly one step. Allocation links an origin to its
   * allocated copy, and that copy may in turn be linked to something else
   * entirely; publishing a request must not publish everything reachable from
   * it, and a cycle must not spin. Anything outside this portal's own scope
   * comes back as a restricted marker with no name.
   */
  private async linkedSummaries(resolved: ResolvedPortal, item: Item, ctx: Awaited<ReturnType<StakeholderPortalService["projectionContext"]>>) {
    const links = await this.repos.links.listByItems([item.id]);
    const otherIds = links.map((link) => (link.itemAId === item.id ? link.itemBId : link.itemAId)).filter((id) => id !== item.id);
    const unique = [...new Set(otherIds)];

    const inScope = await this.repos.stakeholderPortals.listRequestsByItems(resolved.workspaceId, unique);
    const publishable = new Set(inScope.filter((request) => request.departmentId === resolved.department.id).map((request) => request.itemId));

    return Promise.all(
      unique.map(async (id) => {
        if (!publishable.has(id)) {
          // Named only as "there is work here". Saying what it is called would
          // publish a task nobody agreed to publish.
          return { id: null, restricted: true, name: null, status: null, boardName: null };
        }
        const linked = await this.repos.items.getById(id);
        if (!linked) return { id: null, restricted: true, name: null, status: null, boardName: null };
        const board = ctx.projection.boards.get(linked.boardId) ?? null;
        const columns = board?.columns ?? (await this.repos.boards.listColumns(linked.boardId));
        const values = board?.values.get(linked.id);
        const boardName = board?.board.name ?? (await this.repos.boards.getById(linked.boardId))?.name ?? null;
        return { id: linked.id, restricted: false, name: linked.name, status: projectStatus(columns, values), boardName };
      }),
    );
  }
}

/** Sortable and unique: when a request arrived, then its id to break ties. */
function cursorOf(request: PortalRequest): string {
  return `${request.bookedAt}|${request.id}`;
}
