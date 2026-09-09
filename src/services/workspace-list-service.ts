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
 * The workspace's shared lists: the asset types a deliverable can be, the
 * stakeholder groups a request comes from.
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
  constructor(private readonly repos: Repositories) {}

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
    const cleaned = cleanListOptions(options);
    await this.repos.workspaceLists.replace(
      workspaceId,
      listKey,
      cleaned.map((option, index) => ({ workspaceId, listKey, name: option.name, color: option.color, position: index })),
    );
    for (const [from, to] of Object.entries(renames)) {
      if (from !== to) await this.rewrite(workspaceId, listKey, from, to);
    }
    return this.lists(workspaceId);
  }

  /** How many rows still carry this option. */
  async usage(workspaceId: EntityId, listKey: WorkspaceListKey, name: string): Promise<ListOptionUsage> {
    if (listKey !== "ASSET_TYPES") {
      // Stakeholder groups are defined here and not yet asked for anywhere, so
      // nothing can be carrying one. Give each new list its own branch as it
      // finds a home.
      return { count: 0, noun: "items" };
    }
    const assets = await this.assetsWithType(workspaceId, name);
    return { count: assets.length, noun: assets.length === 1 ? "deliverable" : "deliverables" };
  }

  /**
   * Takes an option out of the list. Rows that carry it are handed
   * `replaceWith` when one is named, and otherwise keep the word they have —
   * the history stays readable, the list just stops offering it.
   */
  async remove(workspaceId: EntityId, listKey: WorkspaceListKey, name: string, options: RemoveListOption = {}): Promise<WorkspaceLists> {
    const current = (await this.lists(workspaceId))[listKey];
    const kept = current.filter((option) => option.name.toLowerCase() !== name.toLowerCase());
    await this.save(workspaceId, listKey, kept);
    if (options.replaceWith !== undefined) await this.rewrite(workspaceId, listKey, name, options.replaceWith);
    return this.lists(workspaceId);
  }

  /** Moves every row carrying `from` onto `to` (or clears it when `to` is null). */
  private async rewrite(workspaceId: EntityId, listKey: WorkspaceListKey, from: string, to: string | null): Promise<void> {
    if (listKey !== "ASSET_TYPES") return;
    const assets = await this.assetsWithType(workspaceId, from);
    for (const asset of assets) await this.repos.itemAssets.update(asset.id, { assetType: to });
  }

  /** Every deliverable in the workspace with this asset type, board by board. */
  private async assetsWithType(workspaceId: EntityId, name: string) {
    const boards = await this.repos.boards.listByWorkspace(workspaceId);
    const perBoard = await Promise.all(boards.map((board) => this.repos.itemAssets.listByBoard(board.id)));
    const wanted = name.trim().toLowerCase();
    return perBoard.flat().filter((asset) => (asset.assetType ?? "").trim().toLowerCase() === wanted);
  }
}
