import type { EntityId, TagOption, WorkspaceListKey, WorkspaceLists } from "@/domain";
import { cleanListOptions, workspaceLists } from "@/domain";
import type { Repositories } from "@/data/repositories";

/** Where an option is still spoken for, so the person deleting it knows what they are about to orphan. */
export interface ListOptionUsage {
  /** How many rows carry this option today. */
  count: number;
  /** What those rows are, for the sentence in the dialog: "12 deliverables". */
  noun: string;
}

/** What to do with the rows that carry an option being deleted. */
export interface RemoveListOption {
  /** Give them this option instead; null leaves the word on them and only takes it out of the list. */
  replaceWith?: string | null;
}

/**
 * How a shared list reaches every workspace when the caller cannot write the
 * others themselves (Supabase: an admin of one workspace may not touch the
 * cells of another). The server runs this same service with the service role.
 */
export interface SharedListTransport {
  saveDepartments(workspaceId: EntityId, options: readonly TagOption[], renames: Record<string, string>): Promise<void>;
  removeDepartment(workspaceId: EntityId, name: string, replaceWith: string | null | undefined): Promise<void>;
  departmentUsage(workspaceId: EntityId, name: string): Promise<ListOptionUsage>;
}

/** The lists every workspace shares. Everything else in a workspace is its own. */
export const SHARED_LIST_KEYS: ReadonlySet<WorkspaceListKey> = new Set(["STAKEHOLDER_GROUPS"]);

/**
 * The workspace's lists: the asset types a deliverable can be, which are this
 * workspace's own (each has its list and its output rates), and the
 * stakeholder groups a request comes from, which every workspace shares.
 *
 * A list nobody has edited has no rows at all — the domain stands the built-in
 * defaults in for it — so the first save writes the whole list out. Saves are
 * whole-list too, which keeps order, colour and membership in one write.
 *
 * Renaming and deleting reach past the list itself: the words are already on
 * deliverables, so a rename carries them along and a delete says how many it is
 * about to leave behind (see usage) and can hand them to another option.
 */
export class WorkspaceListService {
  constructor(
    private readonly repos: Repositories,
    /**
     * The department registry, kept in step here.
     *
     * Stakeholder groups are edited in exactly one place — this list — and a
     * portal cannot hang off a list row, because saving rewrites the rows. So
     * the save settles both: the words, and the departments those words name.
     * Doing it here rather than in a second screen is what stops the two
     * drifting apart.
     */
    private readonly portals?: { syncDepartments(workspaceId: EntityId, options: readonly TagOption[], renames?: Readonly<Record<string, string>>): Promise<unknown> },
    /**
     * Where department changes go when they cannot be made here. Departments
     * are one list for every workspace: a rename in one renames the tasks of
     * all of them. Null does it in place, across every workspace this service
     * can reach (the local provider, and the server).
     */
    private readonly shared: SharedListTransport | null = null,
  ) {}

  /** Every list, defaults included. */
  async lists(workspaceId: EntityId): Promise<WorkspaceLists> {
    return workspaceLists(await this.repos.workspaceLists.listByWorkspace(workspaceId));
  }

  /**
   * Writes one list out whole. `renames` maps an old name to its new one, and
   * every row still carrying the old word is brought along — a rename should
   * never quietly strand the things it names.
   */
  async save(workspaceId: EntityId, listKey: WorkspaceListKey, options: readonly TagOption[], renames: Record<string, string> = {}): Promise<WorkspaceLists> {
    if (SHARED_LIST_KEYS.has(listKey)) {
      if (this.shared) await this.shared.saveDepartments(workspaceId, options, renames);
      else for (const id of await this.everyWorkspace(workspaceId)) await this.saveOne(id, listKey, options, renames);
      return this.lists(workspaceId);
    }
    return this.saveOne(workspaceId, listKey, options, renames);
  }

  /**
   * A new workspace takes the shared lists as they stand: from `fromWorkspaceId`
   * when given, otherwise from any other workspace.
   */
  async adoptShared(workspaceId: EntityId, fromWorkspaceId: EntityId | null): Promise<void> {
    const source = fromWorkspaceId ?? (await this.repos.workspaces.list()).find((w) => w.id !== workspaceId)?.id ?? null;
    if (!source) return;
    const lists = await this.lists(source);
    for (const key of SHARED_LIST_KEYS) {
      const rows = await this.repos.workspaceLists.listByWorkspace(source);
      // A list nobody edited is the defaults everywhere; nothing to copy.
      if (!rows.some((row) => row.listKey === key)) continue;
      await this.saveOne(workspaceId, key, lists[key]);
    }
  }

  /** The workspaces a shared list is written to: every one there is, with the caller's own first. */
  private async everyWorkspace(workspaceId: EntityId): Promise<EntityId[]> {
    const all = (await this.repos.workspaces.list()).map((w) => w.id);
    return [workspaceId, ...all.filter((id) => id !== workspaceId)];
  }

  private async saveOne(workspaceId: EntityId, listKey: WorkspaceListKey, options: readonly TagOption[], renames: Record<string, string> = {}): Promise<WorkspaceLists> {
    const cleaned = cleanListOptions(options);
    const departments = listKey === "STAKEHOLDER_GROUPS";
    const before = departments ? (await this.lists(workspaceId))[listKey] : [];
    await this.repos.workspaceLists.replace(
      workspaceId,
      listKey,
      cleaned.map((option, index) => ({ workspaceId, listKey, name: option.name, color: option.color, position: index })),
    );
    // Identity flows through `renames`: it is the only record of what the person
    // meant, and guessing from the names afterwards is how one department's
    // history ends up attached to another. Before the cells are rewritten: the
    // database only takes a department that is on the list, so the new name has
    // to be a department by the time a task is labelled with it.
    if (departments) await this.portals?.syncDepartments(workspaceId, cleaned, renames);
    for (const [from, to] of Object.entries(renames)) {
      if (from !== to) await this.rewrite(workspaceId, listKey, from, to);
    }
    // A department that leaves the list leaves its tasks too. Only departments on
    // the list label work, so the dashboard never counts one it cannot name;
    // `remove` moves them to another department first when it was asked to.
    if (departments) {
      const kept = new Set(cleaned.map((option) => option.name.toLowerCase()));
      const renamed = new Set(Object.keys(renames).map((name) => name.toLowerCase()));
      for (const option of before) {
        if (!kept.has(option.name.toLowerCase()) && !renamed.has(option.name.toLowerCase())) await this.rewrite(workspaceId, listKey, option.name, null);
      }
    }
    return this.lists(workspaceId);
  }

  /** How many rows still carry this option. */
  async usage(workspaceId: EntityId, listKey: WorkspaceListKey, name: string): Promise<ListOptionUsage> {
    if (listKey === "STAKEHOLDER_GROUPS") {
      // Every workspace's tasks: the list is theirs as much as this one's.
      if (this.shared) return this.shared.departmentUsage(workspaceId, name);
      let count = 0;
      for (const id of await this.everyWorkspace(workspaceId)) count += (await this.stakeholderCells(id, name)).length;
      return { count, noun: count === 1 ? "task" : "tasks" };
    }
    const assets = await this.assetsWithType(workspaceId, name);
    return { count: assets.length, noun: assets.length === 1 ? "deliverable" : "deliverables" };
  }

  /**
   * Takes an option out of the list. Rows that carry it are handed
   * `replaceWith` when one is named. Otherwise an asset type stays on its
   * deliverables — the history stays readable, the list just stops offering
   * it — and a department is cleared from its tasks, since only departments on
   * the list may label work.
   */
  async remove(workspaceId: EntityId, listKey: WorkspaceListKey, name: string, options: RemoveListOption = {}): Promise<WorkspaceLists> {
    if (SHARED_LIST_KEYS.has(listKey)) {
      if (this.shared) await this.shared.removeDepartment(workspaceId, name, options.replaceWith);
      else {
        const current = (await this.lists(workspaceId))[listKey];
        const kept = current.filter((option) => option.name.toLowerCase() !== name.toLowerCase());
        const workspaces = await this.everyWorkspace(workspaceId);
        if (options.replaceWith !== undefined) for (const id of workspaces) await this.rewrite(id, listKey, name, options.replaceWith);
        for (const id of workspaces) await this.saveOne(id, listKey, kept);
      }
      return this.lists(workspaceId);
    }
    const current = (await this.lists(workspaceId))[listKey];
    const kept = current.filter((option) => option.name.toLowerCase() !== name.toLowerCase());
    // Moved while the word is still on the list, then the list is saved without
    // it: the other way round, a department's tasks would be cleared by the
    // save before they could be moved.
    if (options.replaceWith !== undefined) await this.rewrite(workspaceId, listKey, name, options.replaceWith);
    await this.saveOne(workspaceId, listKey, kept);
    return this.lists(workspaceId);
  }

  /**
   * Moves every row carrying `from` onto `to` (or clears it when `to` is null).
   *
   * In one write, not one per row. Renaming "Contents" touches 393 cells in
   * this workspace, and a loop of single writes made that 393 round trips to
   * the database — the better part of a minute with a spinner on it, for an
   * edit that adding a group did instantly. The bulk write already existed on
   * the repository; this asked for it a row at a time.
   */
  private async rewrite(workspaceId: EntityId, listKey: WorkspaceListKey, from: string, to: string | null): Promise<void> {
    if (listKey === "STAKEHOLDER_GROUPS") {
      // The cells store the word, so a rename has to carry them along or every
      // task ends up labelled with a group the list no longer offers.
      const cells = await this.stakeholderCells(workspaceId, from);
      if (cells.length > 0) await this.repos.items.setValues(cells.map((cell) => ({ itemId: cell.itemId, columnId: cell.columnId, value: { type: "STAKEHOLDER", group: to } })));
      return;
    }
    const assets = await this.assetsWithType(workspaceId, from);
    // No bulk patch for deliverables, so they go together rather than in a
    // queue: the round trips overlap instead of adding up.
    await Promise.all(assets.map((asset) => this.repos.itemAssets.update(asset.id, { assetType: to })));
  }

  /**
   * Every STAKEHOLDER cell in the workspace carrying this word.
   *
   * Note what this does *not* do: it never touches a portal. Provenance lives in
   * portal_requests, and a label is a display value — renaming a group changes
   * what tasks are labelled, and moving a request between departments is a
   * separate, deliberate action.
   */
  private async stakeholderCells(workspaceId: EntityId, name: string) {
    const boards = await this.repos.boards.listByWorkspace(workspaceId);
    // Every board's columns at once, then the values of the stakeholder
    // columns among them — two rounds of requests rather than two per board,
    // and it reads the one kind of column it is about instead of every value
    // in the workspace.
    const columns = (await Promise.all(boards.map((board) => this.repos.boards.listColumns(board.id)))).flat();
    const stakeholder = columns.filter((column) => column.type === "STAKEHOLDER").map((column) => column.id);
    if (stakeholder.length === 0) return [];
    const wanted = name.trim().toLowerCase();
    const found: Array<{ itemId: EntityId; columnId: EntityId }> = [];
    for (const value of await this.repos.items.listValuesByColumns(stakeholder)) {
      if (value.value.type !== "STAKEHOLDER") continue;
      if ((value.value.group ?? "").trim().toLowerCase() === wanted) found.push({ itemId: value.itemId, columnId: value.columnId });
    }
    return found;
  }

  /** Every deliverable in the workspace with this asset type, board by board. */
  private async assetsWithType(workspaceId: EntityId, name: string) {
    const boards = await this.repos.boards.listByWorkspace(workspaceId);
    const perBoard = await Promise.all(boards.map((board) => this.repos.itemAssets.listByBoard(board.id)));
    const wanted = name.trim().toLowerCase();
    return perBoard.flat().filter((asset) => (asset.assetType ?? "").trim().toLowerCase() === wanted);
  }
}
