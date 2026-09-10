import type {
  Board,
  BoardColumn,
  BookingCustomField,
  BookingForm,
  BookingFormTemplate,
  BookingReceipt,
  BookingRequest,
  BookingTeamOption,
  BookingTemplate,
  ColumnValue,
  EntityId,
  Item,
  NotificationInput,
  PriorityColumnSettings,
  Team,
  WorkspaceMember,
} from "@/domain";
import { BOOKING_ASSET_TYPES, bookingReference, customFields, defaultBookingFormTemplate, defaultSettingsFor, formatAssetLine, isEmptyValue, toTagOptions } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId } from "@/lib/ids";
import { bookingRequestSchema, describeBooking, extraFieldsFor, mapBookingToColumns, normaliseBookingTemplate, resolveBookingTemplate, validateBookingAgainstTemplate } from "./booking";
import type { ItemAssetService } from "./item-asset-service";
import { mapColumns, translateValue } from "./item-link-sync";
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
    // The workspace's own list first (Settings → Lists), then the receiving
    // column's palette, then the built-in words.
    const assetColumn = columns.find((c) => c.type === "TAGS" && c.settings.kind === "tags" && c.name.toLowerCase().includes("asset"));
    const columnTypes = assetColumn && assetColumn.settings.kind === "tags" && assetColumn.settings.options.length ? assetColumn.settings.options : BOOKING_ASSET_TYPES;
    const storedLists = await this.repos.workspaceLists.listByWorkspace(workspaceId);
    const listTypes = storedLists.filter((row) => row.listKey === "ASSET_TYPES");
    const assetTypes = listTypes.length > 0 ? toTagOptions(listTypes) : columnTypes;

    const options: BookingTeamOption[] = offered.map((team, i) => {
      const board = receiving[i];
      const fields = board ? extraFieldsFor(columnsByBoard.get(board.id) ?? []) : [];
      return { id: team.id, name: team.name, description: team.description, color: team.color, icon: team.icon, boardName: board?.name ?? null, fields };
    });
    return { workspaceId, workspaceName: workspace.name, workspaceSlug: workspace.slug, assetTypes, priorities, teams: options, template: resolveBookingTemplate(workspace) };
  }

  /**
   * Writes a booking onto its board: the chosen team's receiving board when it
   * has one, otherwise Task Allocation with the requested team noted. Each asset
   * line becomes a subitem. The item is recorded as the signed-in member when
   * one booked it, else as the workspace owner (a public booking has no account
   * behind it); the requester is in the columns and the description regardless.
   */
  async book(workspaceId: EntityId, rawRequest: BookingRequest, memberId: EntityId | null = null, stakeholder: string | null = null): Promise<BookingReceipt> {
    const request = bookingRequestSchema.parse(rawRequest) as BookingRequest;
    const { workspace, board: allocation, teams } = await this.systemEntities(workspaceId);
    const team = request.teamId ? (teams.find((t) => t.id === request.teamId) ?? null) : null;
    if (request.teamId && (!team || team.workspaceId !== workspaceId || team.archivedAt || team.system)) throw new Error("That team is no longer taking bookings. Pick another, or leave it blank.");

    // The form's own rules: what it marked required, and answers only to questions it asks.
    const template = resolveBookingTemplate(workspace);
    const problems = validateBookingAgainstTemplate(request, template);
    if (Object.keys(problems).length) throw new Error(Object.values(problems).join(". "));
    const asked = new Set(customFields(template).map((f) => f.id));
    request.answers = Object.fromEntries(Object.entries(request.answers).filter(([id]) => asked.has(id)));

    const receiving = team?.bookingBoardId ? await this.repos.boards.getById(team.bookingBoardId) : null;
    const direct = !!receiving && receiving.workspaceId === workspaceId && receiving.archivedAt === null && !receiving.system;
    const board = direct ? receiving! : allocation;

    const [columns, groups, members] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id), this.repos.workspaces.listMembers(workspaceId)]);
    const actorId = this.actorFor(members, board, memberId);
    const group = groups.slice().sort((a, b) => a.position - b.position)[0];
    if (!group) throw new Error(`${board.name} has no group to receive bookings.`);

    const placement = mapBookingToColumns(request, columns, { team, template, stakeholder });
    const description = describeBooking(request, placement);
    // The form works out the reference before anything is written by naming the
    // id the item will have. Honoured only if it is still free: an id already in
    // use would fail the insert, and the receipt then carries the real one.
    const proposed = request.itemId && !(await this.repos.items.getById(request.itemId)) ? request.itemId : undefined;
    // The id is settled before the write so the booking code can be settled with
    // it: the code is the id's tail, and the stakeholder was shown it already.
    const itemId = proposed ?? newId();
    const item = await this.items.createItem(
      {
        id: itemId,
        boardId: board.id,
        groupId: group.id,
        name: request.title,
        description: description || null,
        reference: bookingReference(itemId),
        values: placement.values.map((v) => ({ columnId: v.columnId, value: v.value })),
      },
      actorId,
    );
    // The asset lines are the only children of a brand-new item, so their
    // positions are known and they can be written together rather than one
    // round trip after another — a stakeholder is waiting on this response.
    // Each asset line is a subitem the team can tick off, and a line on the
    // item's Assets tab, where type, quantity, person in charge and due date live.
    const assetType = request.assetTypes.length === 1 ? request.assetTypes[0]! : null;
    await Promise.all([
      ...request.assets.map((asset, index) => {
        // Each asset carries a code of its own, so a subitem can be quoted the
        // same way the task can.
        const assetItemId = newId();
        return this.items.createItem(
          {
            id: assetItemId,
            boardId: board.id,
            groupId: group.id,
            name: formatAssetLine({ ...asset, spec: null }),
            parentItemId: item.id,
            position: index,
            description: asset.spec?.trim() || null,
            reference: bookingReference(assetItemId),
          },
          actorId,
        );
      }),
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

  // ---- shaping the form ----------------------------------------------------

  /**
   * Stores the form an admin shaped, for everyone from now on. A custom question
   * bound for a column gets one on Task Allocation here — created when the board
   * has none of that name and type, otherwise reused — so the answers have
   * somewhere to land the moment the form goes live. Columns left behind by a
   * question that was removed or re-pointed at the brief stay: their values are
   * the team's history.
   */
  async saveForm(workspaceId: EntityId, input: BookingFormTemplate): Promise<BookingFormTemplate> {
    const template = normaliseBookingTemplate(input);
    // A form saved exactly as the built-in one is stored as nothing at all, so
    // the workspace goes on following the built-in form as the app improves it
    // rather than pinning today's copy of it. Both sides go through the same
    // parser first: it settles the order of the keys, which a plain compare of
    // the two objects would otherwise trip over.
    if (JSON.stringify(template) === JSON.stringify(normaliseBookingTemplate(defaultBookingFormTemplate()))) return this.resetForm(workspaceId);
    const { board } = await this.systemEntities(workspaceId);
    const columns = await this.repos.boards.listColumns(board.id);
    for (const field of customFields(template)) {
      if (field.destination !== "column") continue;
      field.columnId = (await this.ensureColumnFor(board.id, columns, field)).id;
    }
    await this.repos.workspaces.update(workspaceId, { bookingForm: template });
    return template;
  }

  /** Back to the built-in form. */
  async resetForm(workspaceId: EntityId): Promise<BookingFormTemplate> {
    await this.repos.workspaces.update(workspaceId, { bookingForm: null });
    return defaultBookingFormTemplate();
  }

  async listTemplates(workspaceId: EntityId): Promise<BookingTemplate[]> {
    return this.repos.bookingTemplates.listByWorkspace(workspaceId);
  }

  /** Saves a form under a name; the same name (whatever its case) replaces the earlier one. */
  async saveTemplate(workspaceId: EntityId, name: string, input: BookingFormTemplate, actorId: EntityId): Promise<BookingTemplate> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the template a name.");
    if (trimmed.length > 80) throw new Error("Keep the template name under 80 characters.");
    const template = normaliseBookingTemplate(input);
    const existing = (await this.repos.bookingTemplates.listByWorkspace(workspaceId)).find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return this.repos.bookingTemplates.update(existing.id, { name: trimmed, template });
    return this.repos.bookingTemplates.create({ workspaceId, name: trimmed, template, createdBy: actorId });
  }

  async deleteTemplate(id: EntityId): Promise<void> {
    await this.repos.bookingTemplates.delete(id);
  }

  /** The column a custom question writes to: the one it had, else one of the same name and type, else a new one. */
  private async ensureColumnFor(boardId: EntityId, columns: BoardColumn[], field: BookingCustomField): Promise<BoardColumn> {
    const norm = (s: string) => s.trim().toLowerCase();
    const existing = columns.find((c) => c.id === field.columnId && c.type === field.type) ?? columns.find((c) => c.type === field.type && norm(c.name) === norm(field.label));
    if (existing) {
      // A choice question's options belong in the column's palette too, so the board colours them.
      if (field.type === "TAGS" && existing.settings.kind === "tags") {
        const known = new Set(existing.settings.options.map((o) => norm(o.name)));
        const missing = field.options.filter((o) => !known.has(norm(o.name)));
        if (missing.length) {
          const updated = await this.repos.boards.updateColumn(existing.id, { settings: { kind: "tags", options: [...existing.settings.options, ...missing.map((o) => ({ ...o }))] } });
          columns.splice(columns.indexOf(existing), 1, updated);
          return updated;
        }
      }
      return existing;
    }
    const settings = field.type === "TAGS" ? { kind: "tags" as const, options: field.options.map((o) => ({ ...o })) } : defaultSettingsFor(field.type);
    const created = await this.repos.boards.createColumn({ boardId, name: field.label, type: field.type, settings });
    columns.push(created);
    return created;
  }

  // ---- allocation ----------------------------------------------------------

  /**
   * A manager places a request from Task Allocation onto a team's board.
   *
   * The request *moves*. It is not copied and the two are not linked: the task
   * the stakeholder booked and the task the team works on are one row, so there
   * is one status, one due date and one set of deliverables, and nothing has to
   * be kept in step. Task Allocation is a queue, and an allocated request has
   * left it.
   *
   * The item keeps its id, so everything pointing at it still resolves - its
   * provenance above all, which is what puts the request in its department's
   * portal. That is why this is a move and not a create-and-delete: deleting
   * the origin would cascade the portal row away and the request would vanish
   * from the portal it was booked through.
   *
   * Column values are translated across, because the two boards describe
   * themselves differently: the mapping is the one a link uses, so a status or
   * a date lands in the column that means the same thing on the team's board,
   * and a value with nowhere to go is dropped rather than stranded.
   */
  async allocate(itemId: EntityId, targetBoardId: EntityId, actorId: EntityId): Promise<{ item: Item; board: Board }> {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const [source, target] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(targetBoardId)]);
    if (!source || !target) throw new NotFoundError("Board", targetBoardId);
    if (source.system !== "TASK_ALLOCATION") throw new Error("Only requests on the Task Allocation board can be allocated.");
    if (target.system || target.archivedAt || target.workspaceId !== source.workspaceId) throw new Error("Pick an active team board in this workspace.");

    const [groups, sourceColumns, targetColumns, sourceValues, targetItems] = await Promise.all([
      this.repos.boards.listGroups(target.id).then((gs) => gs.slice().sort((a, b) => a.position - b.position)),
      this.repos.boards.listColumns(source.id),
      this.repos.boards.listColumns(target.id),
      this.repos.items.listValuesByItem(item.id),
      this.repos.items.listByBoard(target.id),
    ]);
    const group = groups[0];
    if (!group) throw new Error(`${target.name} has no group to receive the task.`);

    // Worked out before the move, while the values still have their columns.
    // Anything the team's board has no column for is left behind: what the
    // requester actually asked for is in the description, which travels.
    const carried: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = [];
    for (const { source: sc, target: tc } of mapColumns(sourceColumns, targetColumns).mapped) {
      const value = sourceValues.find((v) => v.columnId === sc.id)?.value;
      if (!value || isEmptyValue(value)) continue;
      const translated = translateValue(value, sc, tc);
      if (translated.kind === "value") carried.push({ itemId: item.id, columnId: tc.id, value: translated.value });
    }

    const position = targetItems.filter((i) => i.groupId === group.id && i.parentItemId === null).length;
    const moved = await this.repos.items.moveToBoard(item.id, { boardId: target.id, groupId: group.id, position });
    if (carried.length) await this.repos.items.setValues(carried);
    // The recap column counts an item's deliverables per board, and they have
    // just changed board, so the figure is worked out again where they landed.
    await this.assets.recompute(item.id, target.id);
    await this.repos.activities.create({
      workspaceId: source.workspaceId,
      boardId: target.id,
      itemId: item.id,
      actorId,
      eventType: "ITEM_MOVED",
      metadata: { itemName: item.name, boardName: target.name, from: source.name, to: target.name },
    });
    return { item: moved, board: target };
  }

  // ---- helpers -------------------------------------------------------------

  private async requireWorkspace(slug: string, key: string | null) {
    const workspace = await this.repos.workspaces.getBySlug(slug);
    if (!workspace) throw new BookingAccessError("This booking link does not point at a workspace.");
    // In local mode the browser is the whole system, so a signed-in person may
    // book without the key; a public visitor must carry the right one.
    if (key !== null && workspace.bookingKey && key !== workspace.bookingKey) throw new BookingAccessError("This booking link is no longer valid. Ask the team for the current one.");
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
    // Who the work is for, as the portal knows it. "Department" above is free
    // text a public requester types about themselves; this one is only ever
    // written from a portal token, so it can be trusted and filtered on.
    { name: "Stakeholder", type: "STAKEHOLDER" },
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
