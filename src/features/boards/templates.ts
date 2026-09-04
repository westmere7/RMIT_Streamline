import type { ColorToken, ColumnType } from "@/domain";

export const BOARD_TEMPLATE_IDS = ["blank", "campaign", "creative-production"] as const;
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
  campaign: {
    id: "campaign",
    name: "Campaign",
    description: "Plan, produce and launch an integrated campaign.",
    groups: [
      { name: "Planning", color: "sky" },
      { name: "Production", color: "orange" },
      { name: "Review", color: "violet" },
      { name: "Live", color: "green" },
      { name: "Completed", color: "gray" },
    ],
    columns: [
      { name: "Owner", type: "PERSON" },
      { name: "Status", type: "STATUS" },
      { name: "Priority", type: "PRIORITY" },
      { name: "Timeline", type: "TIMELINE" },
      { name: "Channel", type: "TAGS" },
    ],
  },
  "creative-production": {
    id: "creative-production",
    name: "Creative Production",
    description: "Brief, design, review and deliver creative assets.",
    groups: [
      { name: "Briefing", color: "gray" },
      { name: "Design", color: "violet" },
      { name: "Internal Review", color: "sky" },
      { name: "Stakeholder Review", color: "amber" },
      { name: "Approved", color: "green" },
      { name: "Delivered", color: "teal" },
    ],
    columns: [
      { name: "Designer", type: "PERSON" },
      { name: "Status", type: "STATUS" },
      { name: "Priority", type: "PRIORITY" },
      { name: "Due Date", type: "DATE" },
      { name: "Format", type: "TEXT" },
      { name: "Market", type: "TAGS" },
    ],
  },
};

export const BOARD_TEMPLATE_LIST: BoardTemplate[] = BOARD_TEMPLATE_IDS.map((id) => BOARD_TEMPLATES[id]);
