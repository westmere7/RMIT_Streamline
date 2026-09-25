import { AlignLeft, Boxes, Building2, Calendar, CalendarCheck2, CalendarClock, CalendarDays, Clock, ChevronDownCircle, CircleDot, ClipboardList, FileText, Flag, GanttChart, GitBranch, Hash, Hourglass, Link2, Shirt, SquareCheck, Tag, Type, UserRound, UserRoundPlus, Users } from "lucide-react";
import type { ComponentType } from "react";
import type { ColumnType } from "@/domain";

/** One Lucide icon per column type, shared by the add-column menu and the link dialog. */
export const COLUMN_TYPE_ICONS: Record<ColumnType, ComponentType<{ className?: string }>> = {
  TEXT: Type,
  LONG_TEXT: AlignLeft,
  RICH_TEXT: FileText,
  BRIEF: ClipboardList,
  STATUS: CircleDot,
  DROPDOWN: ChevronDownCircle,
  PERSON: UserRound,
  PEOPLE: Users,
  REQUESTER: UserRoundPlus,
  DATE: CalendarDays,
  TIMELINE: GanttChart,
  NUMBER: Hash,
  PLAIN_DATE: Calendar,
  TIME: Clock,
  DATETIME: CalendarClock,
  COUNTDOWN: Hourglass,
  BOOKED_AT: CalendarCheck2,
  PRIORITY: Flag,
  CHECKBOX: SquareCheck,
  LINK: Link2,
  TAGS: Tag,
  STAKEHOLDER: Building2,
  SIZE: Shirt,
  ASSETS_RECAP: Boxes,
  DEPENDENCY: GitBranch,
};
