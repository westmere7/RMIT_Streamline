import { AlignLeft, Boxes, Building2, CalendarDays, CircleDot, Flag, GanttChart, GitBranch, Hash, Link2, Shirt, SquareCheck, Tag, Type, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import type { ColumnType } from "@/domain";

/** One Lucide icon per column type, shared by the add-column menu and the link dialog. */
export const COLUMN_TYPE_ICONS: Record<ColumnType, ComponentType<{ className?: string }>> = {
  TEXT: Type,
  LONG_TEXT: AlignLeft,
  STATUS: CircleDot,
  PERSON: UserRound,
  DATE: CalendarDays,
  TIMELINE: GanttChart,
  NUMBER: Hash,
  PRIORITY: Flag,
  CHECKBOX: SquareCheck,
  LINK: Link2,
  TAGS: Tag,
  STAKEHOLDER: Building2,
  SIZE: Shirt,
  ASSETS_RECAP: Boxes,
  DEPENDENCY: GitBranch,
};
