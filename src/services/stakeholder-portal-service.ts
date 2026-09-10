import type {
  Board,
  BoardColumn,
  BookingForm,
  Comment,
  BookingReceipt,
  BookingRequest,
  DepartmentPortal,
  DepartmentStatus,
  EntityId,
  Item,
  ItemAsset,
  ItemLink,
  PortalContext,
  PortalGate,
  PortalPresentation,
  PortalRefusal,
  PortalRequest,
  PortalTask,
  PortalTaskDetail,
  PortalTaskPage,
  PortalSubmission,
  PortalBoardPayload,
  PortalTheme,
  StakeholderDepartment,
  TagOption,
  User,
} from "@/domain";
import {
  generatePortalToken,
  isPlausiblePortalToken,
  isPortalColumnKey,
  isPortalGrouping,
  isPortalView,
  MAX_PORTAL_DESCRIPTION,
  MAX_PUBLIC_BRIEF,
  PORTAL_PAGE_SIZE,
  reconcileDepartments,
  toTagOptions,
  WORKSPACE_LIST_META,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import { hashPortalPassword, verifyPortalPassword } from "@/lib/auth/portal-password";
import { todayISO } from "@/lib/dates/dates";
import { buildPortalBoard, type PortalBoardTask } from "./portal/portal-board";
import {
  matchesPortalSearch,
  toPortalPerson,
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

/**
 * A submission key that cannot be honoured as sent.
 *
 * Both cases are conflicts over one key rather than anything wrong with the
 * request, so they carry a reason the HTTP layer turns into a 409. Thrown as a
 * plain Error, these read as an unhandled fault: the caller got a 500 and
 * "something went wrong on the server" for a refusal the server made on
 * purpose, and the form could not tell them what to do about it.
 */
export class PortalSubmissionError extends Error {
  constructor(
    /** `reused` is a different booking wearing an old key; `pending` is one still being written. */
    readonly reason: "reused" | "pending",
    message: string,
  ) {
    super(message);
    this.name = "PortalSubmissionError";
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
  /**
   * Who is asking, on the local provider only.
   *
   * Under Supabase this is ignored entirely: the server resolves the viewer
   * from a bearer token it verifies itself, because a caller claiming to be
   * somebody is not evidence of anything.
   */
  viewer?: PortalViewer | null;
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

/**
 * One request in a department's portal, and how it got there.
 *
 * Two things put a task in front of a department, and they are deliberately
 * different in kind. A booking made through the portal leaves a `portal_requests`
 * row: deliberate, durable, and carrying the brief the requester typed. A task
 * simply *labelled* with the department in its STAKEHOLDER column is the team's
 * own record of who the work is for, and it is what makes the portal show a
 * department everything it has, rather than only what arrived after the portal
 * existed.
 *
 * The difference matters downstream. A labelled task has no stored brief, and it
 * never borrows `items.description` for one — that field carries requester
 * contact details the booking writer appended.
 */
export interface PortalScopeEntry {
  itemId: EntityId;
  /** When it arrived: its booking time when it was booked here, else when the task was made. */
  bookedAt: string;
  /** The requester's own words. Only ever from provenance; null for a labelled task. */
  publicBrief: string | null;
  /** True when a portal_requests row names this item. */
  booked: boolean;
}

export interface DepartmentOverview {
  department: StakeholderDepartment;
  portal: DepartmentPortal | null;
}

/**
 * How a portal page reaches the server when the browser cannot read for itself.
 *
 * Under Supabase it cannot: a stakeholder has no session, so the reads run with
 * the service role behind a route handler. Under the local provider the browser
 * *is* the database, so the same calls run straight through the service. The
 * page never knows which — it calls the same four methods either way, which is
 * how the local suite exercises the real behaviour rather than a stand-in.
 */
export interface PortalTransport {
  gate(token: string): Promise<PortalGate>;
  board(grant: PortalGrant): Promise<PortalBoardPayload & { context: PortalContext }>;
  tasks(grant: PortalGrant, options: { cursor?: string | null; limit?: number; search?: string }): Promise<PortalTaskPage & { context: PortalContext }>;
  task(grant: PortalGrant, itemId: EntityId): Promise<PortalTaskDetail>;
  book(grant: PortalGrant, submissionKey: string, request: BookingRequest): Promise<BookingReceipt>;
  bookingForm(grant: PortalGrant): Promise<BookingForm>;
  comment(grant: PortalGrant, itemId: EntityId, body: string): Promise<void>;
  setDeliverableDone(grant: PortalGrant, itemId: EntityId, assetId: EntityId, done: boolean): Promise<void>;
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
  constructor(
    private readonly repos: Repositories,
    /** Set for Supabase, where a visitor's reads must go through the server. */
    private readonly transport: PortalTransport | null = null,
    /** Builds the workspace's booking form. Injected rather than imported, to keep the two services apart. */
    private readonly buildForm: (workspaceId: EntityId) => Promise<BookingForm> = async () => {
      throw new Error("This portal cannot build a booking form.");
    },
  ) {}

  // ---- what a portal page calls ---------------------------------------------

  /**
   * The four calls the page makes, over the transport when there is one.
   *
   * With no transport these run here, against the repositories the browser
   * already holds — which is the local provider, and which is what lets the
   * end-to-end suite drive the genuine gate, projection and idempotency rather
   * than a mock of them.
   */
  async publicGate(token: string): Promise<PortalGate> {
    return this.transport ? this.transport.gate(token) : this.gate(token);
  }

  async publicBoard(grant: PortalGrant): Promise<PortalBoardPayload & { context: PortalContext }> {
    if (this.transport) return this.transport.board(grant);
    const resolved = await this.resolve(grant);
    const [payload, context] = await Promise.all([this.board(resolved), this.context(resolved, grant.viewer ?? null)]);
    return { ...payload, context };
  }

  async publicTasks(grant: PortalGrant, options: { cursor?: string | null; limit?: number; search?: string } = {}): Promise<PortalTaskPage & { context: PortalContext }> {
    if (this.transport) return this.transport.tasks(grant, options);
    const resolved = await this.resolve(grant);
    const [page, context] = await Promise.all([this.tasks(resolved, options), this.context(resolved, grant.viewer ?? null)]);
    return { ...page, context };
  }

  async publicTask(grant: PortalGrant, itemId: EntityId): Promise<PortalTaskDetail> {
    if (this.transport) return this.transport.task(grant, itemId);
    const resolved = await this.resolve(grant);
    return this.task(resolved, itemId, grant.viewer ?? null);
  }

  /** The booking form, behind the same gate: a workspace's questions are not public. */
  async publicBookingForm(grant: PortalGrant): Promise<BookingForm> {
    if (this.transport) return this.transport.bookingForm(grant);
    const resolved = await this.resolve(grant);
    return this.buildForm(resolved.workspaceId);
  }

  async publicBook(grant: PortalGrant, submissionKey: string, request: BookingRequest, booking: { book(workspaceId: EntityId, request: BookingRequest, memberId: EntityId | null, stakeholder: string | null): Promise<BookingReceipt> }): Promise<BookingReceipt> {
    if (this.transport) return this.transport.book(grant, submissionKey, request);
    const resolved = await this.resolve(grant);
    return this.book(resolved, { submissionKey, request, booking, memberId: grant.viewer?.userId ?? null });
  }

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

  /**
   * Every department with its link and its request count.
   *
   * The count is what the portal would actually publish — bookings *and*
   * labelled tasks — not just the provenance rows. An administrator about to
   * open a link needs to know how much it exposes, and a number that only
   * counted bookings would say "0" for a department with forty labelled tasks.
   */
  /**
   * The departments and their links.
   *
   * No request count. Producing one meant scoping every department — the
   * workspace's whole label index, then every candidate item and every link
   * between them — which is the same work as opening six portals at once, and
   * it was what made this screen take seconds to show a list of switches that
   * had not changed. The count is a click away on the portal itself.
   */
  async overview(workspaceId: EntityId): Promise<DepartmentOverview[]> {
    const [departments, portals] = await Promise.all([this.ensureDepartments(workspaceId), this.repos.stakeholderPortals.listPortals(workspaceId)]);
    const byDepartment = new Map(portals.map((portal) => [portal.departmentId, portal]));
    return departments.map((department) => ({ department, portal: byDepartment.get(department.id) ?? null }));
  }

  /**
   * The department's requests, as a board.
   *
   * Same authorisation, same projection, same allowlist as `tasks` — this only
   * arranges the result differently, so that the app's own views and item panel
   * can render it. Nothing extra is read and nothing extra is published; see
   * `buildPortalBoard` for what is deliberately left out.
   */
  async board(resolved: ResolvedPortal): Promise<PortalBoardPayload> {
    const { entries, items: loaded } = await this.scopeWithItems(resolved.department);
    const ctx = await this.projectionContext(resolved, entries, loaded);

    const tasks: PortalBoardTask[] = [];
    for (const entry of entries) {
      const item = ctx.itemsById.get(entry.itemId);
      if (!item) continue;
      tasks.push({
        task: projectTask(item, ctx.projection),
        brief: entry.publicBrief,
        deliverables: (ctx.projection.assetsByItem.get(entry.itemId) ?? []).map((asset) => projectDeliverable(asset, ctx.projection.usersById)),
        subitems: (ctx.projection.subitemsByParent.get(entry.itemId) ?? []).map((subitem) => projectSubitem(subitem, ctx.projection)),
      });
    }

    const workspace = await this.repos.workspaces.getById(resolved.workspaceId);
    const payload = buildPortalBoard({
      department: resolved.department,
      hiddenColumns: resolved.portal.hiddenColumns,
      grouping: resolved.portal.grouping,
      tasks,
      links: ctx.links,
      comments: ctx.comments,
      commentAuthors: [...new Set(ctx.comments.map((comment) => comment.authorId))]
        .map((id) => ctx.projection.usersById.get(id))
        .filter((user): user is User => !!user)
        .map(toPortalPerson),
      // The team's own name for itself, which is what the header says.
      workspaceName: workspace?.creativeTeamName?.trim() || workspace?.name || "",
      now: new Date().toISOString(),
    });
    // Over the whole set, and computed here: which statuses mean done is a
    // property of the boards, not something a visitor should have to infer.
    const types = new Set(tasks.flatMap((entry) => [...entry.task.assetTypes, ...entry.deliverables.map((d) => d.assetType)]).filter(Boolean));
    const totals = summarise(
      tasks.map((entry) => entry.task),
      ctx.projection.today,
      types.size,
    );
    return { ...payload, totals, servedAt: new Date().toISOString() };
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

  /**
   * How a portal presents itself.
   *
   * Presentation only: nothing here widens what a link may see, and none of it
   * touches the credential. Hiding a column removes it from the page, not from
   * the authorisation — the value was already published to this department, and
   * a setting that pretended otherwise would be a security claim it cannot keep.
   */
  async setPresentation(workspaceId: EntityId, departmentId: EntityId, patch: PortalPresentation): Promise<DepartmentPortal> {
    const portal = await this.ensurePortal(workspaceId, departmentId);
    const cleaned: PortalPresentation = { ...patch };
    if (patch.description !== undefined) {
      const trimmed = patch.description?.trim() ?? "";
      cleaned.description = trimmed ? trimmed.slice(0, MAX_PORTAL_DESCRIPTION) : null;
    }
    if (patch.hiddenColumns !== undefined) cleaned.hiddenColumns = [...new Set(patch.hiddenColumns.filter(isPortalColumnKey))];
    if (patch.defaultView !== undefined && !isPortalView(patch.defaultView)) delete cleaned.defaultView;
    if (patch.grouping !== undefined && !isPortalGrouping(patch.grouping)) delete cleaned.grouping;
    return this.repos.stakeholderPortals.updatePortal(portal.id, cleaned);
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
      description: resolved.portal.description,
      defaultView: resolved.portal.defaultView,
      allowBooking: resolved.portal.allowBooking,
      showRecap: resolved.portal.showRecap,
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
    // Everything this department may see, for the totals and the search. Read
    // once and in full, because a figure computed over one page would be a lie.
    const { entries: all, items: loaded } = await this.scopeWithItems(resolved.department);
    const ctx = await this.projectionContext(resolved, all, loaded);
    const projected = all
      .map((entry) => {
        const item = ctx.itemsById.get(entry.itemId);
        return item ? { entry, task: projectTask(item, ctx.projection) } : null;
      })
      .filter((row): row is { entry: PortalScopeEntry; task: PortalTask } => !!row);

    const search = options.search?.trim() ?? "";
    const matching = search ? projected.filter((row) => matchesPortalSearch(row.task, row.entry.publicBrief, search)) : projected;
    const totals = summarise(
      matching.map((row) => row.task),
      ctx.projection.today,
    );

    const after = options.cursor ? matching.findIndex((row) => cursorOf(row.entry) === options.cursor) : -1;
    const start = after >= 0 ? after + 1 : 0;
    const page = matching.slice(start, start + limit);
    const nextCursor = start + limit < matching.length && page.length > 0 ? cursorOf(page[page.length - 1]!.entry) : null;

    return { tasks: page.map((row) => row.task), nextCursor, totals, servedAt: new Date().toISOString() };
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
    const scoped = await this.scopeWithItems(resolved.department);
    const entry = scoped.entries.find((row) => row.itemId === itemId);
    if (!entry) throw new PortalAccessError("unknown", "That request is not part of this portal.");
    const ctx = await this.projectionContext(resolved, [entry], scoped.items);
    const item = ctx.itemsById.get(itemId);
    if (!item) throw new PortalAccessError("unknown", "That request is no longer available.");

    const base = projectTask(item, ctx.projection);
    const assets = ctx.projection.assetsByItem.get(itemId) ?? [];
    const subitems = ctx.projection.subitemsByParent.get(itemId) ?? [];
    const linked = await this.linkedSummaries(resolved, item, ctx);

    return {
      ...base,
      brief: entry.publicBrief,
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

  /**
   * The two things a member of staff may do from inside a portal.
   *
   * Both re-check everything on the way through, here as well as in the route
   * handler: the task must belong to this portal, and the caller must hold an
   * editor's or owner's seat on that task's own board. A stakeholder reaches
   * neither, and a member of staff reaching one for a task on a board they are
   * not on is refused just the same.
   */
  async publicComment(grant: PortalGrant, itemId: EntityId, body: string, comments: { addComment(itemId: EntityId, body: string, actorId: EntityId, users: readonly User[]): Promise<unknown> }): Promise<void> {
    if (this.transport) return void (await this.transport.comment(grant, itemId, body));
    const { resolved, viewer } = await this.admitWriter(grant, itemId);
    void resolved;
    await comments.addComment(itemId, body, viewer.userId, await this.repos.users.list());
  }

  async publicSetDeliverableDone(grant: PortalGrant, itemId: EntityId, assetId: EntityId, done: boolean, assets: { update(id: EntityId, patch: { completedAt: string | null }, actorId: EntityId): Promise<unknown> }): Promise<void> {
    if (this.transport) return void (await this.transport.setDeliverableDone(grant, itemId, assetId, done));
    const { viewer } = await this.admitWriter(grant, itemId);
    const asset = await this.repos.itemAssets.getById(assetId);
    // The asset's own owner decides, not the id it was paired with in the call.
    if (!asset || asset.itemId !== itemId) throw new PortalAccessError("unknown", "That deliverable is not part of this request.");
    await assets.update(assetId, { completedAt: done ? new Date().toISOString() : null }, viewer.userId);
  }

  /** The gate, the portal's own scope, and a seat on the board — in that order. */
  private async admitWriter(grant: PortalGrant, itemId: EntityId): Promise<{ resolved: ResolvedPortal; viewer: PortalViewer }> {
    const resolved = await this.resolve(grant);
    const inScope = (await this.scope(resolved.department)).some((row) => row.itemId === itemId);
    if (!inScope) throw new PortalAccessError("unknown", "That request is not part of this portal.");
    const viewer = grant.viewer ?? null;
    if (!viewer || !(await this.canAct(resolved, itemId, viewer))) throw new PortalAccessError("unknown", "Only someone on this task's board can do that here.");
    return { resolved, viewer };
  }

  // ---- booking through a portal -------------------------------------------------

  /**
   * A booking made from a department's portal.
   *
   * Three things make this different from the public booking form.
   *
   * The department is not negotiable. It comes from the token that got the
   * caller this far, and whatever the body said about a department is
   * overwritten before the request is validated. There is no path from the body
   * to another department: `extra` and `answers` can only address columns whose
   * type is in BOOKING_FIELD_TYPES, and STAKEHOLDER is not one of them, so a
   * spoofed stakeholder value cannot even reach a column. The receiving board's
   * STAKEHOLDER column is written here instead, from `resolved.department.name`
   * — the token's own answer to who is asking — so Task Allocation shows which
   * portal a task arrived through, and the team can group and filter by it.
   *
   * The submission key makes a retry safe. It is claimed in the database before
   * anything is written, and the unique constraint on (portal, key) is what
   * settles a race between two taps: one insert wins and the other replays the
   * winner's receipt. The same key arriving with different content is refused —
   * that is a different booking wearing an old key.
   *
   * The provenance and the task are written together, in the sense that matters:
   * the claim is released if anything fails, so a caller may retry, and the
   * receipt is only recorded once the request is genuinely visible in the
   * portal. This is a durable claim with compensation, not a transaction — the
   * repositories speak REST and cannot offer one — and the failure it cannot
   * fully close is noted in the portal's documentation.
   */
  async book(
    resolved: ResolvedPortal,
    input: { submissionKey: string; request: BookingRequest; booking: { book(workspaceId: EntityId, request: BookingRequest, memberId: EntityId | null, stakeholder: string | null): Promise<BookingReceipt> }; memberId?: EntityId | null },
  ): Promise<BookingReceipt> {
    // A link the team has set to reading only takes no requests. Checked here,
    // where every path to a booking passes, rather than by hiding a button.
    if (!resolved.portal.allowBooking) throw new PortalAccessError("off", "This portal is not taking new requests at the moment.");

    const key = input.submissionKey.trim();
    if (key.length < 8 || key.length > 100) throw new Error("A booking needs a submission key of its own.");

    // The department is decided here, from the credential, and written over
    // whatever arrived. The brief the requester typed is captured before the
    // booking writer appends their contact details to the description.
    const request: BookingRequest = { ...input.request, department: resolved.department.name };
    const publicBrief = request.brief?.trim() ? request.brief.trim().slice(0, MAX_PUBLIC_BRIEF) : null;
    const requestHash = await hashSubmission(resolved.portal.id, request);

    const existing = await this.repos.stakeholderPortals.getSubmission(resolved.portal.id, key);
    if (existing) return this.replay(existing, requestHash);

    let claim;
    try {
      claim = await this.repos.stakeholderPortals.createSubmission({ portalId: resolved.portal.id, submissionKey: key, requestHash, itemId: null, receipt: null });
    } catch {
      // Somebody else claimed it between the read and the write: the other
      // attempt is the booking, and this one replays its receipt.
      const winner = await this.repos.stakeholderPortals.getSubmission(resolved.portal.id, key);
      if (!winner) throw new Error("That booking could not be recorded. Try again.");
      return this.replay(winner, requestHash);
    }

    try {
      const receipt = await input.booking.book(resolved.workspaceId, request, input.memberId ?? null, resolved.department.name);
      await this.associate({
        workspaceId: resolved.workspaceId,
        departmentId: resolved.department.id,
        itemId: receipt.itemId,
        source: "PORTAL_BOOKING",
        publicBrief,
      });
      await this.repos.stakeholderPortals.completeSubmission(claim.id, { itemId: receipt.itemId, receipt });
      return receipt;
    } catch (error) {
      // The key goes back so the stakeholder can try again with it. Without
      // this a failed attempt would burn the key and every retry would be
      // refused as a duplicate.
      await this.repos.stakeholderPortals.deleteSubmission(claim.id).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Hands back what the first attempt produced.
   *
   * A key that arrives with different content is not a retry. Replaying the old
   * receipt would tell the caller their new booking succeeded when nothing was
   * written, so it is refused instead.
   */
  private replay(submission: PortalSubmission, requestHash: string): BookingReceipt {
    if (submission.requestHash !== requestHash) {
      throw new PortalSubmissionError("reused", "That submission key has already been used for a different booking. Reload the form and try again.");
    }
    if (!submission.receipt) {
      // Claimed but never completed: an attempt is in flight, or one died
      // mid-way. Either way this caller must not start a second booking.
      throw new PortalSubmissionError("pending", "That booking is still being recorded. Give it a moment and check your requests before sending it again.");
    }
    return submission.receipt as BookingReceipt;
  }

  // ---- internals --------------------------------------------------------------

  private async requireDepartment(workspaceId: EntityId, departmentId: EntityId): Promise<StakeholderDepartment> {
    const department = await this.repos.stakeholderPortals.getDepartment(departmentId);
    if (!department || department.workspaceId !== workspaceId) throw new Error("That department is not part of this workspace.");
    return department;
  }

  /**
   * Everything a department may see, deduplicated and newest first.
   *
   * The union of two sources: tasks booked through this portal (provenance), and
   * tasks the team has labelled with this department in a STAKEHOLDER column.
   * The label is how a department sees the work it already had, rather than only
   * what arrived after its portal existed.
   *
   * Three rules keep the list honest:
   *
   *  · Only top-level, unarchived tasks. A subitem belongs inside its parent,
   *    not beside it, and archived work is gone.
   *  · Linked tasks collapse to one row. Allocation makes a second item and
   *    links it, and both usually carry the label; listing both would count one
   *    request twice. The booked one wins, else the earliest — deterministic,
   *    and never "whichever changed last".
   *  · A labelled task has no brief. `items.description` is not a brief; it
   *    carries whatever contact details the booking writer appended.
   */
  private async scope(department: StakeholderDepartment, preloaded?: { labelled: Map<string, EntityId[]>; items: Map<EntityId, Item> }): Promise<PortalScopeEntry[]> {
    return (await this.scopeWithItems(department, preloaded)).entries;
  }

  /**
   * As `scope`, keeping the items it read.
   *
   * Deciding what is in scope means loading the candidates anyway, and the
   * projection then needs the very same rows. Handing them over is one fewer
   * round trip over a few hundred ids on every page and every task detail.
   */
  private async scopeWithItems(
    department: StakeholderDepartment,
    preloaded?: { labelled: Map<string, EntityId[]>; items: Map<EntityId, Item> },
  ): Promise<{ entries: PortalScopeEntry[]; items: Map<EntityId, Item> }> {
    const [provenance, labelled] = await Promise.all([
      this.allRequests(department.id),
      preloaded?.labelled ? Promise.resolve(preloaded.labelled) : this.labelledItemIds(department.workspaceId),
    ]);
    // The stakeholder label decides. A task relabelled from one department to
    // another moves: it appears under the new one and stops appearing under the
    // old, which is what changing the cell plainly means. Provenance is what
    // keeps a *booking* visible — a task booked here and never labelled belongs
    // to the department that booked it — and it is what carries the brief, but
    // it no longer pins a task to a department the board has since moved it out
    // of.
    const anyLabel = new Set<EntityId>([...labelled.values()].flat());
    const candidates = new Set<EntityId>([
      ...(labelled.get(departmentKey(department.name)) ?? []),
      ...provenance.filter((row) => !anyLabel.has(row.itemId)).map((row) => row.itemId),
    ]);
    if (candidates.size === 0) return { entries: [], items: new Map() };

    const loaded = preloaded?.items ?? (await this.itemsByIdFor([...candidates]));
    const items = [...candidates].map((id) => loaded.get(id)).filter((item): item is Item => !!item);
    const eligible = items.filter((item) => item.parentItemId === null && item.archivedAt === null);
    const byId = new Map(eligible.map((item) => [item.id, item]));
    const briefs = new Map(provenance.map((row) => [row.itemId, row]));

    // Collapse each run of linked tasks to the one that represents it.
    const links = await this.linksForItems([...byId.keys()]);
    const canonical = collapseLinked([...byId.keys()], links, (id) => ({ booked: briefs.has(id), createdAt: byId.get(id)!.createdAt }));

    const entries: PortalScopeEntry[] = [];
    for (const id of canonical) {
      const item = byId.get(id)!;
      const row = briefs.get(id);
      entries.push({ itemId: id, bookedAt: row?.bookedAt ?? item.createdAt, publicBrief: row?.publicBrief ?? null, booked: !!row });
    }
    entries.sort((a, b) => b.bookedAt.localeCompare(a.bookedAt) || b.itemId.localeCompare(a.itemId));
    return { entries, items: loaded };
  }

  /**
   * Items by id, in batches.
   *
   * `listByIds` is one request per batch where `getById` is one per item, and a
   * department with a few hundred labelled tasks makes that difference the whole
   * response time.
   */
  private async itemsByIdFor(ids: readonly EntityId[]): Promise<Map<EntityId, Item>> {
    const batches = await Promise.all(chunk(ids).map((batch) => this.repos.items.listByIds(batch)));
    return new Map(batches.flat().map((item) => [item.id, item]));
  }

  /**
   * The update threads on these items, in batches.
   *
   * A department reads the team's updates on its own work: the thread is how
   * anybody finds out what is happening, and a portal that hid it sent people
   * back to email. It is scoped exactly as everything else is — only items this
   * portal already publishes — and it is the one place internal writing reaches
   * a stakeholder, so what the team posts on a published task is public to that
   * department.
   */
  private async commentsForItems(ids: readonly EntityId[]): Promise<Comment[]> {
    const batches = await Promise.all(chunk(ids).map((batch) => this.repos.comments.listByItems(batch)));
    return batches.flat();
  }

  /** Links touching any of these items, in batches for the same reason. */
  private async linksForItems(ids: readonly EntityId[]): Promise<ItemLink[]> {
    const batches = await Promise.all(chunk(ids).map((batch) => this.repos.links.listByItems(batch)));
    const byId = new Map(batches.flat().map((link) => [link.id, link]));
    return [...byId.values()];
  }

  /**
   * Every STAKEHOLDER value in the workspace, grouped by the word it holds.
   *
   * Read board by board through each board's own columns, so a workspace with
   * no stakeholder columns costs one listing and nothing more. The result is
   * shared across departments by `overview`, which would otherwise repeat this
   * once per department.
   */
  private async labelledItemIds(workspaceId: EntityId): Promise<Map<string, EntityId[]>> {
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((board) => board.archivedAt === null);
    // Every board's columns at once. Sequentially this was the larger half of
    // the wait, and one board's columns do not depend on another's.
    const columns = (await Promise.all(boards.map((board) => this.repos.boards.listColumns(board.id)))).flat();
    // By type, never by name. A board may call its stakeholder column
    // "Department", "Requested by" or anything else, and renaming it must not
    // quietly empty a portal.
    const stakeholder = columns.filter((column) => column.type === "STAKEHOLDER").map((column) => column.id);
    if (stakeholder.length === 0) return new Map();

    // Only the stakeholder columns. Asking each board for every value it holds
    // read an order of magnitude more rows than the answer needed.
    const byName = new Map<string, EntityId[]>();
    for (const value of await this.repos.items.listValuesByColumns(stakeholder)) {
      if (value.value.type !== "STAKEHOLDER" || !value.value.group) continue;
      const key = departmentKey(value.value.group);
      const ids = byName.get(key);
      if (ids) ids.push(value.itemId);
      else byName.set(key, [value.itemId]);
    }
    return byName;
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
  private async projectionContext(resolved: ResolvedPortal, entries: readonly PortalScopeEntry[], preloaded?: Map<EntityId, Item>) {
    // `scope` has already read these; loading them a second time cost a whole
    // round trip per page for nothing.
    const loaded = preloaded ?? (await this.itemsByIdFor(entries.map((entry) => entry.itemId)));
    const items = entries.map((entry) => loaded.get(entry.itemId)).filter((item): item is Item => !!item);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const boardIds = [...new Set(items.map((item) => item.boardId))];

    const boards = new Map<string, BoardContext>();
    const assetsByItem = new Map<string, ItemAsset[]>();
    const subitemsByParent = new Map<string, Item[]>();
    const wanted = new Set(items.map((item) => item.id));

    // Every board at once. Walking them in turn made the wait their sum, and a
    // department with work on ten boards paid ten round trips for reads that
    // depend on nothing.
    const perBoard = (
      await Promise.all(
        boardIds.map(async (boardId) => {
          const [board, columns, boardItems, assets] = await Promise.all([
            this.repos.boards.getById(boardId),
            this.repos.boards.listColumns(boardId),
            this.repos.items.listByBoard(boardId),
            this.repos.itemAssets.listByBoard(boardId),
          ]);
          return board ? { board, columns, boardItems, assets } : null;
        }),
      )
    ).filter((entry): entry is { board: Board; columns: BoardColumn[]; boardItems: Item[]; assets: ItemAsset[] } => !!entry);

    for (const entry of perBoard) {
      for (const candidate of entry.boardItems) {
        // Subitems of a published request travel; every other item on the board
        // is none of this department's business.
        if (candidate.parentItemId && wanted.has(candidate.parentItemId)) {
          subitemsByParent.set(candidate.parentItemId, [...(subitemsByParent.get(candidate.parentItemId) ?? []), candidate]);
          // A subitem's own status is read through its board, so it needs to be
          // resolvable too.
          itemsById.set(candidate.id, candidate);
        }
      }
      for (const asset of entry.assets) {
        if (!wanted.has(asset.itemId)) continue;
        assetsByItem.set(asset.itemId, [...(assetsByItem.get(asset.itemId) ?? []), asset]);
      }
    }

    // Values for exactly the items in play — this department's requests and
    // their subitems — rather than everything sitting on the boards they happen
    // to live on, which was an order of magnitude more rows than the answer.
    const [values, links, users, comments] = await Promise.all([
      this.repos.items.listValuesByItems([...itemsById.keys()]),
      this.linksForItems([...wanted]),
      this.repos.users.list(),
      this.commentsForItems([...itemsById.keys()]),
    ]);

    for (const entry of perBoard) boards.set(entry.board.id, { board: entry.board, columns: entry.columns, values: new Map() });
    for (const value of values) {
      const item = itemsById.get(value.itemId);
      const context = item ? boards.get(item.boardId) : undefined;
      if (!context) continue;
      let bucket = context.values.get(value.itemId);
      if (!bucket) {
        bucket = new Map();
        context.values.set(value.itemId, bucket);
      }
      bucket.set(value.columnId, value.value);
    }

    const linkCountByItem = new Map<string, number>();
    for (const link of links) {
      for (const id of [link.itemAId, link.itemBId]) {
        if (wanted.has(id)) linkCountByItem.set(id, (linkCountByItem.get(id) ?? 0) + 1);
      }
    }


    const usersById = new Map<string, User>(users.map((user) => [user.id, user]));
    const projection: ProjectionContext = {
      boards,
      usersById,
      assetsByItem,
      subitemsByParent,
      linkCountByItem,
      bookedAtByItem: new Map(entries.map((entry) => [entry.itemId, entry.bookedAt])),
      // A board's name says which team is doing the work, which is what the
      // stakeholder asked for. It is a board name, not its contents.
      publishSourceName: true,
      today: todayISO(),
    };
    return { itemsById, projection, links, comments };
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
    const links = await this.linksForItems([item.id]);
    const otherIds = links.map((link) => (link.itemAId === item.id ? link.itemBId : link.itemAId)).filter((id) => id !== item.id);
    const unique = [...new Set(otherIds)];

    const publishable = new Set((await this.scope(resolved.department)).map((row) => row.itemId));

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

/**
 * A digest of what was submitted, so a reused key can be told from a retry.
 *
 * Not a security hash — it never guards anything — just a stable fingerprint of
 * the payload that decided the booking. The portal is part of it so the same key
 * cannot mean one thing in one department and something else in another.
 */
async function hashSubmission(portalId: EntityId, request: BookingRequest): Promise<string> {
  const canonical = JSON.stringify([
    portalId,
    request.title?.trim() ?? "",
    request.brief?.trim() ?? "",
    request.requesterEmail?.trim().toLowerCase() ?? "",
    request.teamId ?? null,
    request.dueDate ?? null,
    request.priority ?? null,
    request.assetTypes,
    request.assets.map((a) => [a.name, a.quantity, a.spec ?? ""]),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ids in batches small enough to ask for.
 *
 * PostgREST puts the filter in the URL, and a URL has a length limit — a few
 * hundred uuids in one `in(...)` overflows the request headers and the whole
 * read fails, which is exactly what a department with a couple of hundred
 * labelled tasks produces. Eighty ids is roughly 3KB of filter, comfortably
 * inside every limit involved.
 */
function chunk(ids: readonly EntityId[], size = 80): EntityId[][] {
  const batches: EntityId[][] = [];
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size) as EntityId[]);
  return batches;
}

/** Sortable and unique: when a request arrived, then its id to break ties. */
function cursorOf(entry: PortalScopeEntry): string {
  return `${entry.bookedAt}|${entry.itemId}`;
}

/** How two department names are compared: trimmed and case-insensitive. */
function departmentKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * One row per run of linked tasks.
 *
 * Allocation makes a second item and links it to the first, and both usually
 * carry the same stakeholder label, so without this a department would see one
 * request twice. The run is walked breadth-first with a visited set, so a cycle
 * terminates, and the representative is chosen deterministically: the booked one
 * if there is exactly one, else the earliest made, else the lowest id. Never
 * "whichever changed most recently", which would make the list reorder itself
 * as people work.
 */
function collapseLinked(
  ids: readonly EntityId[],
  links: readonly { itemAId: EntityId; itemBId: EntityId }[],
  describe: (id: EntityId) => { booked: boolean; createdAt: string },
): EntityId[] {
  const present = new Set(ids);
  const neighbours = new Map<EntityId, EntityId[]>();
  for (const link of links) {
    if (!present.has(link.itemAId) || !present.has(link.itemBId)) continue;
    neighbours.set(link.itemAId, [...(neighbours.get(link.itemAId) ?? []), link.itemBId]);
    neighbours.set(link.itemBId, [...(neighbours.get(link.itemBId) ?? []), link.itemAId]);
  }

  const seen = new Set<EntityId>();
  const chosen: EntityId[] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const run: EntityId[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const id = queue.shift()!;
      run.push(id);
      for (const next of neighbours.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    run.sort((a, b) => {
      const left = describe(a);
      const right = describe(b);
      if (left.booked !== right.booked) return left.booked ? -1 : 1;
      return left.createdAt.localeCompare(right.createdAt) || a.localeCompare(b);
    });
    chosen.push(run[0]!);
  }
  return chosen;
}
