import type { Board, BoardColumn, BookingForm, BookingReceipt, BookingRequest, BookingTeamOption, EntityId, Item, NotificationInput, PriorityColumnSettings, Team, WorkspaceMember } from "@/domain";
import { BOOKING_ASSET_TYPES, bookingReference, formatAssetLine } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { bookingRequestSchema, describeBooking, extraFieldsFor, mapBookingToColumns } from "./booking";
import type { ItemAssetService } from "./item-asset-service";
import type { ItemLinkService } from "./item-link-service";
import type { ItemService } from "./item-service";
import type { NotificationService } from "./notification-service";
import type { WorkspaceService } from "./workspace-service";

/**
 * How the browser reaches the booking endpoints when it cannot run the service
 * itself. With Supabase a public booking has no session behind it, so the form
 * is loaded and submitted through the app's own route handlers, which run this
 * same service with the service role. Local mode needs no transport: the
 * browser store is right there.
 */
export interface BookingTransport {
  getForm(input: { workspaceSlug: string; key: string | null }): Promise<BookingForm>;
  submit(input: BookingSubmission): Promise<BookingReceipt>;
}

export interface BookingSubmission {
  workspaceSlug: string;
  /** The secret from the public link; null from inside the app. */
  key: string | null;
  request: BookingRequest;
  /**
   * The signed-in member booking, when there is one: the item is recorded as
   * theirs. Only honoured where the caller is trusted (local mode, or the server
   * after checking the session); the HTTP transport drops it and the server
   * reads the session instead.
   */
  actorId?: EntityId | null;
}

export class BookingAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingAccessError";
  }
}

export class BookingService {
  constructor(
    private readonly repos: Repositories,
    private readonly workspace: WorkspaceService,
    private readonly items: ItemService,
    private readonly links: ItemLinkService,
    private readonly assets: ItemAssetService,
    private readonly notifications: NotificationService,
    private readonly transport: BookingTransport | null,
  ) {}

  // ---- the public form -----------------------------------------------------

  /**
   * What the booking page shows. `key` is the secret from the public link; pass
   * null from inside the app, where the person is already signed in (the
   * transport carries their session instead).
   */
  async getForm(input: { workspaceSlug: string; key: string | null }): Promise<BookingForm> {
    if (this.transport) return this.transport.getForm(input);
    const workspace = await this.requireWorkspace(input.workspaceSlug, input.key);
    return this.buildForm(workspace.id);
  }

  async submit(input: BookingSubmission): Promise<BookingReceipt> {
    if (this.transport) return this.transport.submit(input);
    const workspace = await this.requireWorkspace(input.workspaceSlug, input.key);
    return this.book(workspace.id, input.request, input.actorId ?? null);
  }

  /**
   * The system entities with the workspace's teams and boards: the quick
   * read-only lookup when everything is in place, the create-or-repair path
   * when it is not (a brand-new workspace, or a system row someone archived).
   */
  private async systemEntities(workspaceId: EntityId) {
    const found = await this.workspace.findSystemEntities(workspaceId);
    if (found) return found;
    const ensured = await this.workspace.ensureSystemEntities(workspaceId);
    const [teams, boards] = await Promise.all([this.repos.teams.listByWorkspace(workspaceId), this.repos.boards.listByWorkspace(workspaceId)]);
    return { ...ensured, teams, boards };
  }

  /** The form for a workspace, once the caller has been allowed in. */
  async buildForm(workspaceId: EntityId): Promise<BookingForm> {
    const { workspace, board: allocation, teams, boards } = await this.systemEntities(workspaceId);
    const offered = teams.filter((t) => t.archivedAt === null && !t.system).sort((a, b) => a.name.localeCompare(b.name));
    const receiving = offered.map((team) => (team.bookingBoardId ? boards.find((b) => b.id === team.bookingBoardId && b.archivedAt === null && !b.system) : undefined));
    // Every board's columns in one round of requests: a stakeholder is looking at a spinner.
    const receivingIds = [...new Set(receiving.flatMap((b) => (b ? [b.id] : [])))];
    const [columns, ...receivingColumns] = await Promise.all([this.repos.boards.listColumns(allocation.id), ...receivingIds.map((id) => this.repos.boards.listColumns(id))]);
    const columnsByBoard = new Map(receivingIds.map((id, i) => [id, receivingColumns[i]!]));

    const priorityColumn = columns.find((c) => c.type === "PRIORITY");
    const priorities = priorityColumn ? (priorityColumn.settings as PriorityColumnSettings).labels.map((l) => ({ name: l.name, color: l.color })) : [];
    const assetColumn = columns.find((c) => c.type === "TAGS" && c.settings.kind === "tags" && c.name.toLowerCase().includes("asset"));
    const assetTypes = assetColumn && assetColumn.settings.kind === "tags" && assetColumn.settings.options.length ? assetColumn.settings.options : BOOKING_ASSET_TYPES;

    const options: BookingTeamOption[] = offered.map((team, i) => {
      const board = receiving[i];
      const fields = board ? extraFieldsFor(columnsByBoard.get(board.id) ?? []) : [];
      return { id: team.id, name: team.name, description: team.description, color: team.color, icon: team.icon, boardName: board?.name ?? null, fields };
    });
    return { workspaceId, workspaceName: workspace.name, workspaceSlug: workspace.slug, assetTypes, priorities, teams: options };
  }

  /**
   * Writes a booking onto its board: the chosen team's receiving board when it
   * has one, otherwise Task Allocation with the requested team noted. Each asset
   * line becomes a subitem. The item is recorded as the signed-in member when
   * one booked it, else as the workspace owner (a public booking has no account
   * behind it); the requester is in the columns and the description regardless.
   */
  async book(workspaceId: EntityId, rawRequest: BookingRequest, memberId: EntityId | null = null): Promise<BookingReceipt> {
    const request = bookingRequestSchema.parse(rawRequest) as BookingRequest;
    const { board: allocation, teams } = await this.systemEntities(workspaceId);
    const team = request.teamId ? (teams.find((t) => t.id === request.teamId) ?? null) : null;
    if (request.teamId && (!team || team.workspaceId !== workspaceId || team.archivedAt || team.system)) throw new Error("That team is no longer taking bookings. Pick another, or leave it blank.");

    const receiving = team?.bookingBoardId ? await this.repos.boards.getById(team.bookingBoardId) : null;
    const direct = !!receiving && receiving.workspaceId === workspaceId && receiving.archivedAt === null && !receiving.system;
    const board = direct ? receiving! : allocation;

    const [columns, groups, members] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id), this.repos.workspaces.listMembers(workspaceId)]);
    const actorId = this.actorFor(members, board, memberId);
    const group = groups.slice().sort((a, b) => a.position - b.position)[0];
    if (!group) throw new Error(`${board.name} has no group to receive bookings.`);

    const placement = mapBookingToColumns(request, columns, { team });
    const description = describeBooking(request, placement);
    const item = await this.items.createItem(
      { boardId: board.id, groupId: group.id, name: request.title, description: description || null, values: placement.values.map((v) => ({ columnId: v.columnId, value: v.value })) },
      actorId,
    );
    // The asset lines are the only children of a brand-new item, so their
    // positions are known and they can be written together rather than one
    // round trip after another — a stakeholder is waiting on this response.
    // Each asset line is a subitem the studio can tick off, and a line on the
    // item's Assets tab, where type, quantity, person in charge and due date live.
    const assetType = request.assetTypes.length === 1 ? request.assetTypes[0]! : null;
    await Promise.all([
      ...request.assets.map((asset, index) =>
        this.items.createItem(
          { boardId: board.id, groupId: group.id, name: formatAssetLine({ ...asset, spec: null }), parentItemId: item.id, position: index, description: asset.spec?.trim() || null },
          actorId,
        ),
      ),
      this.assets.addMany(
        request.assets.map((asset) => ({ itemId: item.id, boardId: board.id, name: asset.name, assetType, quantity: asset.quantity, dueDate: request.dueDate, notes: asset.spec?.trim() || null })),
        actorId,
      ),
    ]);

    await this.notifyAdmins(members, board, item, request, team, actorId);
    return {
      itemId: item.id,
      itemName: item.name,
      boardId: board.id,
      boardName: board.name,
      boardSlug: board.slug,
      teamName: direct ? team!.name : null,
      reference: bookingReference(item.id),
      submittedAt: item.createdAt,
      assetCount: request.assets.length,
    };
  }

  // ---- allocation ----------------------------------------------------------

  /**
   * A manager places a request from Task Allocation onto a team's board: a new
   * item is created there, filled from the request through the boards' column
   * mapping, and the two are linked so progress on the team's board shows on
   * Task Allocation (and to the stakeholder later). The request moves to the
   * "Allocated" group and records where it went.
   */
  async allocate(itemId: EntityId, targetBoardId: EntityId, actorId: EntityId): Promise<{ item: Item; created: Item; board: Board }> {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const [source, target] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(targetBoardId)]);
    if (!source || !target) throw new NotFoundError("Board", targetBoardId);
    if (source.system !== "TASK_ALLOCATION") throw new Error("Only requests on the Task Allocation board can be allocated.");
    if (target.system || target.archivedAt || target.workspaceId !== source.workspaceId) throw new Error("Pick an active team board in this workspace.");

    const groups = (await this.repos.boards.listGroups(target.id)).sort((a, b) => a.position - b.position);
    const group = groups[0];
    if (!group) throw new Error(`${target.name} has no group to receive the task.`);

    const placeholder = await this.items.createItem({ boardId: target.id, groupId: group.id, name: item.name }, actorId);
    // Linking fills the new item from the request (name, description and every
    // column the two boards have in common) and keeps them in step from now on.
    await this.links.link(item.id, placeholder.id, actorId, { seedFrom: "item" });
    const [created, sourceItems, columns, sourceGroups] = await Promise.all([
      this.repos.items.getById(placeholder.id).then((fresh) => fresh ?? placeholder),
      this.repos.items.listByBoard(source.id),
      this.repos.boards.listColumns(source.id),
      this.repos.boards.listGroups(source.id),
    ]);
    // The asset lines travel as subitems of the new item; they are not linked one
    // by one. They are the new item's only children, so they go in together.
    const subitems = sourceItems.filter((i) => i.parentItemId === item.id).sort((a, b) => a.position - b.position);
    await Promise.all([
      ...subitems.map((sub, index) => this.items.createItem({ boardId: target.id, groupId: group.id, name: sub.name, parentItemId: created.id, position: index, description: sub.description }, actorId)),
      this.assets.copyTo(item.id, created.id, target.id, actorId),
    ]);

    const allocatedTo = columns.find((c) => c.type === "TEXT" && c.name.toLowerCase().includes("allocated"));
    if (allocatedTo) await this.repos.items.setValue(item.id, allocatedTo.id, { type: "TEXT", text: target.name });
    const allocated = sourceGroups.find((g) => g.name.toLowerCase() === "allocated");
    let updated = item;
    if (allocated && item.groupId !== allocated.id) {
      const siblings = sourceItems.filter((i) => i.groupId === allocated.id && i.parentItemId === null);
      updated = await this.repos.items.update(item.id, { groupId: allocated.id, position: siblings.length });
      // The asset lines belong with their request: left in "Incoming" they would
      // be deleted with that group and counted against it.
      const stranded = subitems.filter((s) => s.groupId !== allocated.id);
      if (stranded.length) await this.repos.items.updateMany(stranded.map((s) => ({ id: s.id, patch: { groupId: allocated.id } })));
    }
    return { item: updated, created, board: target };
  }

  // ---- helpers -------------------------------------------------------------

  private async requireWorkspace(slug: string, key: string | null) {
    const workspace = await this.repos.workspaces.getBySlug(slug);
    if (!workspace) throw new BookingAccessError("This booking link does not point at a workspace.");
    // In local mode the browser is the whole system, so a signed-in person may
    // book without the key; a public visitor must carry the right one.
    if (key !== null && workspace.bookingKey && key !== workspace.bookingKey) throw new BookingAccessError("This booking link is no longer valid. Ask the studio for the current one.");
    return workspace;
  }

  /** Who a booking is recorded as: the member who booked it if they belong here, else the workspace owner, else the board's owner. */
  private actorFor(members: readonly WorkspaceMember[], board: Board, memberId: EntityId | null): EntityId {
    if (memberId && members.some((m) => m.userId === memberId && m.status === "ACTIVE")) return memberId;
    const owner = members.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? members.find((m) => m.role === "OWNER");
    return owner?.userId ?? board.ownerId;
  }

  private async notifyAdmins(members: readonly WorkspaceMember[], board: Board, item: Item, request: BookingRequest, team: Team | null, actorId: EntityId): Promise<void> {
    const admins = members.filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN"));
    const where = team ? `for ${team.name}` : "to Task Allocation";
    const inputs: NotificationInput[] = admins.map((m) => ({
      userId: m.userId,
      type: "TASK_BOOKED",
      title: `${request.requesterName} booked “${item.name}” ${where}`,
      body: request.dueDate ? `Due ${request.dueDate}. Open it on ${board.name} to review and allocate.` : `Open it on ${board.name} to review and allocate.`,
      entityType: "ITEM",
      entityId: item.id,
      boardId: board.id,
      actorId,
    }));
    if (inputs.length) await this.notifications.deliver(inputs);
  }
}

/** Columns the Task Allocation board is created with. Kept here so the form and the board agree. */
export function taskAllocationColumns(teamNames: readonly string[]): Array<Pick<BoardColumn, "name" | "type"> & { settings?: BoardColumn["settings"] }> {
  return [
    { name: "Requester", type: "TEXT" },
    { name: "Email", type: "TEXT" },
    { name: "Department", type: "TEXT" },
    { name: "Asset type", type: "TAGS", settings: { kind: "tags", options: BOOKING_ASSET_TYPES.map((o) => ({ ...o })) } },
    { name: "Assets & specs", type: "LONG_TEXT" },
    { name: "Requested team", type: "TAGS", settings: { kind: "tags", options: teamNames.map((name, i) => ({ name, color: TEAM_TAG_COLORS[i % TEAM_TAG_COLORS.length]! })) } },
    { name: "Status", type: "STATUS" },
    { name: "Priority", type: "PRIORITY" },
    { name: "Due Date", type: "DATE" },
    { name: "Reference", type: "LINK" },
    { name: "Assets recap", type: "ASSETS_RECAP" },
    { name: "Allocated to", type: "TEXT" },
  ];
}

const TEAM_TAG_COLORS = ["blue", "orange", "violet", "green", "sky", "amber", "teal", "pink", "rose", "cyan"] as const;
