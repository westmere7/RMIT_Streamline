import type { Board, Item, ItemOpenings } from "@/domain";
import { NO_ITEM_OPENINGS } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { routes } from "@/lib/routes";
import type { StakeholderPortalService } from "./stakeholder-portal-service";

/** Whether the person asking may see a board, asked as them. Null when nobody is signed in. */
export type BoardSight = ((board: Board) => Promise<boolean>) | null;

/**
 * Where else a task behind a shared link opens, for the person holding it.
 *
 * Both of a task's links (Share by link, and a booking's own task link) open
 * the same read-only page; from it, somebody who is signed in and can see the
 * task's board can go to it there, and anybody can go to the workspace's portal
 * while it is open and shows the task. Worked out once per visit, on the
 * server, never from anything the page says about itself.
 */
export class ItemOpeningsService {
  constructor(
    private readonly repos: Repositories,
    private readonly portals: StakeholderPortalService,
  ) {}

  async for(item: Item, board: Board, canSeeBoard: BoardSight): Promise<ItemOpenings> {
    const workspace = await this.repos.workspaces.getById(board.workspaceId);
    if (!workspace) return NO_ITEM_OPENINGS;
    const [seesBoard, onPortal] = await Promise.all([
      canSeeBoard && !board.archivedAt ? canSeeBoard(board).catch(() => false) : Promise.resolve(false),
      // The portal shows live tasks, not subitems.
      item.archivedAt === null && item.parentItemId === null ? this.portals.showsItem(board.workspaceId, item.id).catch(() => false) : Promise.resolve(false),
    ]);
    return {
      // An archived task is in its board's archive, not on the board.
      board: seesBoard ? (item.archivedAt ? routes.boardArchive(workspace.slug, board.slug, { itemId: item.id }) : routes.board(workspace.slug, board.slug, { itemId: item.id })) : null,
      portal: onPortal ? routes.workspacePortal(workspace.slug, { task: item.id }) : null,
    };
  }
}
