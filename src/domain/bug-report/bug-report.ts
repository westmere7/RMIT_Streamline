import type { BoardColumn, ColumnLabel } from "@/domain/board/column";
import type { ColorToken, EntityId } from "@/domain/common/types";

/**
 * Bug reports: filed by anybody from About or their own menu, landing as tasks
 * in the Bugs group of a board called App development.
 *
 * The board is built in (`system = "APP_DEVELOPMENT"`): the app makes it the
 * first time somebody reports a bug, and it cannot be archived, moved or
 * deleted. Otherwise it works like any board. Only its owner and members see
 * it, workspace admins included; its one member to begin with is the person who
 * looks after the app, and everyone else files into it without seeing it.
 */

/** Who looks after the app: the board's owner and the person each report is assigned to. */
export const BUG_BOARD_OWNER_EMAIL = "danh.nguyen15@rmit.edu.vn";

export const BUG_BOARD = { name: "App development", description: "Bugs reported from inside the app.", color: "violet", icon: "bug" } as const satisfies { name: string; description: string; color: ColorToken; icon: string };
export const BUG_GROUP = { name: "Bugs", color: "red" } as const satisfies { name: string; color: ColorToken };

export const BUG_CATEGORIES = [
  { id: "broken", name: "Something broke", color: "red" },
  { id: "looks-wrong", name: "Looks wrong", color: "violet" },
  { id: "wrong-data", name: "Wrong data", color: "orange" },
  { id: "slow", name: "Slow", color: "amber" },
  { id: "phone", name: "On a phone", color: "sky" },
  { id: "idea", name: "Idea", color: "green" },
  { id: "other", name: "Other", color: "gray" },
] as const satisfies readonly ColumnLabel[];

export type BugCategoryId = (typeof BUG_CATEGORIES)[number]["id"];

export const BUG_STATUS_LABELS: ColumnLabel[] = [
  { id: "new", name: "New", color: "gray" },
  { id: "working", name: "Looking into it", color: "orange" },
  { id: "fixed", name: "Fixed", color: "green" },
  { id: "wont-fix", name: "Won't fix", color: "violet" },
];

/** Bug reports carry tickets of their own series, BUG_001 and on, apart from the workspace's. */
export const BUG_TICKET_PREFIX = "BUG";

/** How many screenshots one report carries, each in its own link column. */
export const MAX_BUG_SCREENSHOTS = 3;
export const MAX_BUG_DESCRIPTION = 4000;

export const BUG_COLUMN_NAMES = {
  status: "Status",
  category: "Category",
  reporter: "Reported by",
  pic: "PIC",
  priority: "Priority",
  brief: "Brief",
  page: "Page",
  version: "Version",
  reported: "Reported",
  screenshot: (index: number) => (index === 0 ? "Screenshot" : `Screenshot ${index + 1}`),
} as const;

/** The board's columns, in order. Anything special the board also has to hold is added after these, hidden. */
export function bugBoardColumns(): Array<Pick<BoardColumn, "name" | "type"> & Partial<Pick<BoardColumn, "settings" | "hidden">>> {
  return [
    { name: BUG_COLUMN_NAMES.status, type: "STATUS", settings: { kind: "status", labels: BUG_STATUS_LABELS.map((l) => ({ ...l })), doneLabelIds: ["fixed", "wont-fix"], stuckLabelIds: [], progressLabelIds: ["working"], defaultLabelId: "new" } },
    { name: BUG_COLUMN_NAMES.category, type: "DROPDOWN", settings: { kind: "dropdown", labels: BUG_CATEGORIES.map((c) => ({ ...c })), defaultLabelId: null } },
    { name: BUG_COLUMN_NAMES.reporter, type: "REQUESTER" },
    { name: BUG_COLUMN_NAMES.pic, type: "PERSON" },
    { name: BUG_COLUMN_NAMES.priority, type: "PRIORITY" },
    { name: BUG_COLUMN_NAMES.brief, type: "BRIEF" },
    ...Array.from({ length: MAX_BUG_SCREENSHOTS }, (_, index) => ({ name: BUG_COLUMN_NAMES.screenshot(index), type: "LINK" as const })),
    { name: BUG_COLUMN_NAMES.page, type: "LINK" },
    { name: BUG_COLUMN_NAMES.version, type: "TEXT" },
    { name: BUG_COLUMN_NAMES.reported, type: "BOOKED_AT" },
  ];
}

/** What the dialog sends. Screenshots are URLs by the time they get here: stored files, or data URLs in local mode. */
export interface BugReportInput {
  category: BugCategoryId;
  description: string;
  screenshots: string[];
  /** Where the reporter was when they opened the dialog. */
  pageUrl: string | null;
  appVersion: string | null;
  userAgent: string | null;
  viewport: string | null;
}

export interface BugReportReceipt {
  itemId: EntityId;
  itemName: string;
  /** BUG_001 and on. */
  ticket: string | null;
}

export function bugCategoryName(id: string): string {
  return BUG_CATEGORIES.find((c) => c.id === id)?.name ?? "Other";
}

/** The task's name: the first line of what was written, cut to a length a row can show. */
export function bugReportTitle(description: string): string {
  const first = description.trim().split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  const clean = first.replace(/\s+/g, " ");
  if (!clean) return "Bug report";
  return clean.length > 90 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}
