/**
 * Boards listed under their teams in a picker (allocation, a service's routing,
 * the routing dialog): one rhythm for both, so the list reads as one, and each
 * board stepped in under the team it belongs to.
 */

/** A team heading: the same height and size as its boards, a shade stronger. */
// Important: a label in the picker carries label-quiet (small and quiet), which would win.
export const TEAM_ROW = "flex h-8 items-center gap-2 px-2 text-[13px]! font-medium text-foreground!";

/** A board, stepped in under its team. */
export const BOARD_ROW = "h-8 pl-7 text-[13px]";
