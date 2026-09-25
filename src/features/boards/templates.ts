import type { ColorToken, ColumnType } from "@/domain";

/**
 * The built-in starting point. Everything else is a template the workspace saved
 * from one of its own boards (see src/domain/board/board-template.ts).
 */
export const BOARD_TEMPLATE_IDS = ["blank"] as const;
export type BoardTemplateId = (typeof BOARD_TEMPLATE_IDS)[number];

export interface BoardTemplate {
  id: BoardTemplateId;
  name: string;
  description: string;
  groups: Array<{ name: string; color: ColorToken }>;
  /** Columns after the built-in Item name column. */
  columns: Array<{ name: string; type: ColumnType }>;
}

export const BOARD_TEMPLATES: Record<BoardTemplateId, BoardTemplate> = {
  blank: {
    id: "blank",
    name: "Blank",
    description: "A single group with owner, status and due date.",
    groups: [{ name: "Group 1", color: "blue" }],
    columns: [
      { name: "Owner", type: "PERSON" },
      { name: "Status", type: "STATUS" },
      { name: "Due Date", type: "DATE" },
    ],
  },
};

export const BOARD_TEMPLATE_LIST: BoardTemplate[] = BOARD_TEMPLATE_IDS.map((id) => BOARD_TEMPLATES[id]);
