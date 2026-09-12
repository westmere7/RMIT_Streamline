import type {
  Board,
  BoardColumn,
  BookingBlock,
  BookingForm,
  BookingFormTemplate,
  BookingReceipt,
  BookingRequest,
  BookingTeamOption,
  BookingSavedBlock,
  BookingTemplate,
  ColumnValue,
  EntityId,
  Item,
  NotificationInput,
  PriorityColumnSettings,
  TagOption,
  Team,
  WorkspaceMember,
} from "@/domain";
import { BOOKING_ASSET_TYPES, MAX_BOOKING_SAVED_BLOCK_NAME, MAX_BOOKING_TEMPLATE_DESCRIPTION, MAX_BOOKING_TEMPLATE_NAME, bookingReference, defaultBookingFormTemplate, flattenBlocks, isEmptyValue, isQuestionBlock, serviceById, toTagOptions } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId } from "@/lib/ids";
import {
  bookingRequestSchema,
  composeBrief,
  describeBooking,
  isDefaultBookingTemplate,
  mapBookingToColumns,
  normaliseBookingTemplate,
  readBookingBlock,
  readBookingTemplate,
  resolveBookingDraft,
  resolveBookingTemplate,
  validateBookingAgainstTemplate,
} from "./booking";
import type { ItemAssetService } from "./item-asset-service";
import { richTextToPlain } from "@/lib/rich-text";
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
    const columns = await this.repos.boards.listColumns(allocation.id);

    const priorityColumn = columns.find((c) => c.type === "PRIORITY");
    const priorities = priorityColumn ? (priorityColumn.settings as PriorityColumnSettings).labels.map((l) => ({ name: l.name, color: l.color })) : [];
    // The workspace's own list first (Settings → Lists), then the receiving
    // column's palette, then the built-in words.
    const assetColumn = columns.find((c) => c.type === "TAGS" && c.settings.kind === "tags" && c.name.toLowerCase().includes("asset"));
    const columnTypes = assetColumn && assetColumn.settings.kind === "tags" && assetColumn.settings.options.length ? assetColumn.settings.options : BOOKING_ASSET_TYPES;
    const storedLists = await this.repos.workspaceLists.listByWorkspace(workspaceId);
    const listTypes = storedLists.filter((row) => row.listKey === "ASSET_TYPES");
    const assetTypes = listTypes.length > 0 ? toTagOptions(listTypes) : columnTypes;

    const options: BookingTeamOption[] = offered.map((team, i) => ({ id: team.id, name: team.name, description: team.description, color: team.color, icon: team.icon, boardName: receiving[i]?.name ?? null }));
    // The stakeholder groups, so "school or department" is picked from a list
    // rather than typed six different ways.
    const departments: TagOption[] = (await this.repos.stakeholderPortals.listDepartments(workspaceId)).map((row) => ({ name: row.name, color: row.color }));
    return { workspaceId, workspaceName: workspace.name, workspaceSlug: workspace.slug, assetTypes, departments, priorities, teams: options, template: resolveBookingTemplate(workspace) };
  }

  /**
   * Writes a booking onto its board: the chosen team's receiving board when it
   * has one, otherwise Task Allocation with the requested team noted. Each asset
   * line lands on the item's Assets tab and nowhere else. The item is recorded as
   * the signed-in member when one booked it, else as the workspace owner (a
   * public booking has no account behind it); the requester is in the columns and
   * the description regardless.
   */
  async book(workspaceId: EntityId, rawRequest: BookingRequest, memberId: EntityId | null = null, stakeholder: string | null = null): Promise<BookingReceipt> {
    const request = bookingRequestSchema.parse(rawRequest) as BookingRequest;
    const { workspace, board: allocation, teams } = await this.systemEntities(workspaceId);
    const template = resolveBookingTemplate(workspace);
    const service = serviceById(template, request.serviceTypeId);
    if (request.serviceTypeId && !service) throw new Error("That kind of work is no longer on the form. Start again and pick another.");

    // Routing is the service's, never the caller's. The stakeholder was not
    // asked which team should do this and cannot be allowed to answer it: the
    // team behind each service is set in the form editor, by somebody who knows.
    const team = service?.teamId ? (teams.find((t) => t.id === service.teamId && t.workspaceId === workspaceId && !t.archivedAt && !t.system) ?? null) : null;
    request.teamId = team?.id ?? null;

    // Only answers to questions this service asks travel, and only sub-services
    // it actually offers - everything else is a word the caller made up.
    // Follow-ups included: a question a choice opens is still a question this
    // service asks, and an answer to one has to be allowed through.
    const asked = new Set(flattenBlocks(service?.blocks ?? []).filter(isQuestionBlock).map((b) => b.id));
    request.answers = Object.fromEntries(Object.entries(request.answers).filter(([id]) => asked.has(id)));
    const offered = new Set((service?.subServices ?? []).map((o) => o.name));
    request.subServices = request.subServices.filter((name) => offered.has(name));

    // The form's own rules: what it marked required, answered in the shape it asked for.
    const problems = validateBookingAgainstTemplate(request, template);
    if (Object.keys(problems).length) throw new Error(Object.values(problems).join(". "));

    // The brief is composed here, from the template and the answers, whatever
    // the caller sent as one. What the team reads is what the form asked for.
    request.brief = composeBrief(request, template);

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
    // The asset lines land on the item's Assets tab, where type, quantity, person
    // in charge and due date live — and nowhere else. They used to be written a
    // second time as subitems, which made every booking arrive as a task with a
    // fold-out of rows saying the same thing the Assets tab already said, and
    // doubled what a board counted. A deliverable is not a task.
    // Each row's own type first; failing that, the one type the whole request named.
    const assetType = request.assetTypes.length === 1 ? request.assetTypes[0]! : null;
    await this.assets.addMany(
      request.assets.map((asset) => ({ itemId: item.id, boardId: board.id, name: asset.name, assetType: asset.assetType?.trim() || assetType, quantity: asset.quantity, dueDate: request.dueDate, notes: asset.spec?.trim() || null })),
      actorId,
    );

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
   * The form an administrator is working on, which is the live one until they
   * have started. Inside the app only: a draft is nobody else's business.
   */
  async getDraft(workspaceId: EntityId): Promise<BookingFormTemplate> {
    const workspace = await this.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new NotFoundError("Workspace", workspaceId);
    return resolveBookingDraft(workspace);
  }

  /**
   * Keeps the editor's work without putting it in front of anybody.
   *
   * Building a four-step form takes longer than a sitting, and for the whole of
   * that time stakeholders are still booking through the form that was live
   * when it started. So editing writes here and only here; `publishForm` is the
   * one act that changes what anybody is served.
   */
  async saveDraft(workspaceId: EntityId, input: BookingFormTemplate): Promise<BookingFormTemplate> {
    const template = normaliseBookingTemplate(input);
    await this.repos.workspaces.update(workspaceId, { bookingFormDraft: template });
    return template;
  }

  /** Throws the work in progress away; the editor goes back to whatever is live. */
  async discardDraft(workspaceId: EntityId): Promise<BookingFormTemplate> {
    await this.repos.workspaces.update(workspaceId, { bookingFormDraft: null });
    const workspace = await this.repos.workspaces.getById(workspaceId);
    return resolveBookingTemplate(workspace);
  }

  /**
   * Puts a form live, for everyone from now on - the public link and the
   * stakeholder portal included. The draft is cleared with it: what was being
   * worked towards has arrived, and leaving it behind would have the editor
   * open for ever after on a "draft" identical to the live form.
   */
  async publishForm(workspaceId: EntityId, input: BookingFormTemplate): Promise<BookingFormTemplate> {
    const template = normaliseBookingTemplate(input);
    // A form published exactly as the built-in one is stored as nothing at all,
    // so the workspace goes on following the built-in form as the app improves
    // it rather than pinning today's copy of it.
    const stored = isDefaultBookingTemplate(template) ? null : template;
    await this.repos.workspaces.update(workspaceId, { bookingForm: stored, bookingFormDraft: null });
    return template;
  }

  /** Back to the built-in form, live and in the editor. */
  async resetForm(workspaceId: EntityId): Promise<BookingFormTemplate> {
    await this.repos.workspaces.update(workspaceId, { bookingForm: null, bookingFormDraft: null });
    return defaultBookingFormTemplate();
  }

  /**
   * The workspace's saved forms, each read as a current one.
   *
   * A template saved by an earlier version is stored in the shape that version
   * wrote, and every reader here — the editor, the list, the counts — expects
   * the current one. Migrating on the way out means one place knows about the
   * old shape; the row itself is left as it is until somebody saves over it.
   */
  async listTemplates(workspaceId: EntityId): Promise<BookingTemplate[]> {
    const rows = await this.repos.bookingTemplates.listByWorkspace(workspaceId);
    return rows.map((row) => ({ ...row, template: readBookingTemplate(row.template) ?? defaultBookingFormTemplate() }));
  }

  /**
   * Saves a form under a name, for the workspace rather than for whoever saved
   * it: one administrator writing a summer form and another loading it back in
   * November is the whole point of these. The same name (whatever its case)
   * replaces the earlier one.
   */
  async saveTemplate(workspaceId: EntityId, input: { name: string; description?: string | null; template: BookingFormTemplate }, actorId: EntityId): Promise<BookingTemplate> {
    const name = input.name.trim();
    if (!name) throw new Error("Give the template a name.");
    if (name.length > MAX_BOOKING_TEMPLATE_NAME) throw new Error("Keep the template name under " + MAX_BOOKING_TEMPLATE_NAME + " characters.");
    const description = input.description?.trim().slice(0, MAX_BOOKING_TEMPLATE_DESCRIPTION) || null;
    const template = normaliseBookingTemplate(input.template);
    const existing = (await this.repos.bookingTemplates.listByWorkspace(workspaceId)).find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return this.repos.bookingTemplates.update(existing.id, { name, description, template });
    return this.repos.bookingTemplates.create({ workspaceId, name, description, template, createdBy: actorId });
  }

  async deleteTemplate(id: EntityId): Promise<void> {
    await this.repos.bookingTemplates.delete(id);
  }

  // ---- saved blocks -----------------------------------------------------------

  /** The workspace's saved blocks, each checked against the current shape; one that no longer reads is left out. */
  async listSavedBlocks(workspaceId: EntityId): Promise<BookingSavedBlock[]> {
    const rows = await this.repos.bookingSavedBlocks.listByWorkspace(workspaceId);
    return rows.flatMap((row) => {
      try {
        return [{ ...row, block: readBookingBlock(row.block) }];
      } catch {
        return [];
      }
    });
  }

  /**
   * Keeps one block under a name, for the workspace. The same name (whatever
   * its case) replaces the earlier one, as a template does.
   */
  async saveBlock(workspaceId: EntityId, input: { name: string; block: BookingBlock }, actorId: EntityId): Promise<BookingSavedBlock> {
    const name = input.name.trim();
    if (!name) throw new Error("Give the block a name.");
    if (name.length > MAX_BOOKING_SAVED_BLOCK_NAME) throw new Error("Keep the block name under " + MAX_BOOKING_SAVED_BLOCK_NAME + " characters.");
    const block = readBookingBlock(input.block);
    const existing = (await this.repos.bookingSavedBlocks.listByWorkspace(workspaceId)).find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (existing) return this.repos.bookingSavedBlocks.update(existing.id, { name, block });
    return this.repos.bookingSavedBlocks.create({ workspaceId, name, block, createdBy: actorId });
  }

  async deleteSavedBlock(id: EntityId): Promise<void> {
    await this.repos.bookingSavedBlocks.delete(id);
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
    // Anything the team's board has no column for is left behind.
    const carried: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = [];
    let briefCarried = false;
    const briefColumn = sourceColumns.find((c) => c.type === "RICH_TEXT") ?? null;
    for (const { source: sc, target: tc } of mapColumns(sourceColumns, targetColumns).mapped) {
      const value = sourceValues.find((v) => v.columnId === sc.id)?.value;
      if (!value || isEmptyValue(value)) continue;
      const translated = translateValue(value, sc, tc);
      if (translated.kind !== "value") continue;
      carried.push({ itemId: item.id, columnId: tc.id, value: translated.value });
      if (sc.id === briefColumn?.id) briefCarried = true;
    }

    // The brief is a column, and a column does not travel to a board that has
    // no column to receive it. It is also the one thing on the task the
    // requester actually wrote, so rather than leave it behind on a board
    // nobody will look at again, it goes back into the description on the way
    // out — flattened, because a description has no formatting to show. A team
    // board with a Brief column of its own never reaches this: the value is
    // carried across as a value, with its formatting on it.
    const briefValue = briefColumn ? sourceValues.find((v) => v.columnId === briefColumn.id)?.value : undefined;
    const brief = briefValue && "text" in briefValue ? richTextToPlain(briefValue.text ?? "").trim() : "";
    if (brief && !briefCarried && !(item.description ?? "").includes(brief)) {
      const description = item.description?.trim() ? `${brief}\n\n${item.description.trim()}` : brief;
      await this.repos.items.update(item.id, { description });
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
    // What kind of work it is, as step one of the form asked it. One tag: the
    // sub-services answer a different question and live in the brief.
    { name: "Service", type: "TAGS", settings: { kind: "tags", options: DEFAULT_SERVICE_TAGS.map((o) => ({ ...o })) } },
    { name: "Asset type", type: "TAGS", settings: { kind: "tags", options: BOOKING_ASSET_TYPES.map((o) => ({ ...o })) } },
    // The whole of step two as one document, formatted: headings for the
    // questions, lists for the choices, live links for the links. It opens as a
    // popup on the board and as one collapsible field on the task panel. A brief
    // is read as a whole or not at all, so it is one column and not a dozen
    // holding a sentence each — and it is not repeated in the description.
    { name: "Brief", type: "RICH_TEXT" },
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

/**
 * The palette the Service column starts with: the services the built-in form
 * offers. A workspace that renames or adds one gets the new word as a plain
 * tag, which is the board's own behaviour for any tag it has not met - the
 * column is a record of what was booked, not a copy of the form.
 */
const DEFAULT_SERVICE_TAGS = defaultBookingFormTemplate().services.map((service) => ({ name: service.name, color: service.color }));
