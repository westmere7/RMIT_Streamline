import type { BoardColumn, ColumnType } from "@/domain/board/column";

/**
 * The jobs a column can do for the rest of the workspace.
 *
 * Every board is laid out differently and the dashboard still has to answer one
 * question across all of them. Until now it found what it needed by guessing:
 * the *first* DATE column on the board was the deadline, and a people column
 * was the requester if its name happened to contain "requester". Both guesses
 * are usually right and silently wrong the rest of the time — a board that puts
 * "Briefed on" before "Due date" reported the wrong deadline, with nothing
 * anywhere to say so.
 *
 * A role is the board saying which column it means. It is optional: where none
 * is set the old guess still runs (see `resolveColumnRoles`), so nothing has to
 * be filled in for a board to keep working, and a board only has to say
 * anything when the guess would be wrong.
 */
export const COLUMN_ROLES = [
  "status",
  "pic",
  "dueDate",
  "timeline",
  "priority",
  "stakeholder",
  "size",
  "assetsRecap",
  "requester",
  "department",
  "requestedTeam",
  "assetType",
  "brief",
] as const;

export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** What each role is called where a person picks one. */
export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  status: "Status",
  pic: "Person in charge",
  dueDate: "Deadline",
  timeline: "Timeline",
  priority: "Priority",
  stakeholder: "Stakeholder",
  size: "Size",
  assetsRecap: "Assets recap",
  requester: "Requester",
  department: "Department",
  requestedTeam: "Requested team",
  assetType: "Asset type",
  brief: "Brief",
};

/** What each role is read for, shown when one is offered. */
export const COLUMN_ROLE_PURPOSE: Record<ColumnRole, string> = {
  status: "The column that says whether work is done, stuck or under way.",
  pic: "The column naming whoever is carrying the work.",
  dueDate: "The deadline: overdue, on-time delivery and the calendar are read off it.",
  timeline: "Start and end, for the Gantt and timeline views.",
  priority: "How urgent the work is, compared across boards.",
  stakeholder: "Who the work is for.",
  size: "How big the piece of work is.",
  assetsRecap: "The live summary of the task's deliverables.",
  requester: "Who asked for the work. Their department is taken from their profile.",
  department: "The school or department the request came from.",
  requestedTeam: "The team the request asked for.",
  assetType: "What kind of deliverable was asked for.",
  brief: "Where an intake booking writes the request.",
};

/**
 * The column types that can do each job, and how one is found without being told.
 *
 * `implied` types *are* the job — a Stakeholder column is who the work is for,
 * whatever it is called — so the first of them is taken. `hinted` types could
 * be anything, so one is only taken when its name says so: "Notes" is not the
 * brief, and a People column is not the requester unless it says it is.
 *
 * Given a role explicitly, either kind will do it. This is only about guessing.
 */
interface RoleTypes {
  implied: readonly ColumnType[];
  hinted: readonly ColumnType[];
}

const ROLE_TYPES: Record<ColumnRole, RoleTypes> = {
  status: { implied: ["STATUS"], hinted: [] },
  pic: { implied: ["PERSON"], hinted: [] },
  dueDate: { implied: ["DATE", "TIMELINE"], hinted: [] },
  timeline: { implied: ["TIMELINE"], hinted: [] },
  priority: { implied: ["PRIORITY"], hinted: [] },
  stakeholder: { implied: ["STAKEHOLDER"], hinted: [] },
  size: { implied: ["SIZE"], hinted: [] },
  assetsRecap: { implied: ["ASSETS_RECAP"], hinted: [] },
  requester: { implied: [], hinted: ["PERSON", "PEOPLE", "TEXT"] },
  department: { implied: ["STAKEHOLDER"], hinted: ["TEXT"] },
  requestedTeam: { implied: [], hinted: ["TAGS", "TEXT"] },
  assetType: { implied: [], hinted: ["TAGS", "TEXT"] },
  brief: { implied: [], hinted: ["RICH_TEXT", "LONG_TEXT"] },
};

/** Every type that can carry a role, however it is found. */
export function columnRoleTypes(role: ColumnRole): readonly ColumnType[] {
  return [...ROLE_TYPES[role].implied, ...ROLE_TYPES[role].hinted];
}

/** The roles a column of this type could be given. */
export function rolesForType(type: ColumnType): ColumnRole[] {
  return COLUMN_ROLES.filter((role) => columnRoleTypes(role).includes(type));
}

/**
 * The names a board might have used for each job before roles existed.
 *
 * These are the fallbacks, not the rule. They are kept exactly as they were so
 * that setting no roles at all leaves every board reading as it did.
 */
const ROLE_NAME_HINTS: Partial<Record<ColumnRole, readonly string[]>> = {
  requester: ["requester", "requested by", "stakeholder", "client", "booked by"],
  department: ["department", "school", "faculty", "portfolio", "unit", "college"],
  requestedTeam: ["requested team", "team"],
  assetType: ["asset type", "asset types", "deliverable type"],
  brief: ["brief", "request detail"],
};

/** The names a board might have used for a job, for the one place that still sniffs them. */
export function roleNameHints(role: ColumnRole): readonly string[] {
  return ROLE_NAME_HINTS[role] ?? [];
}

const hasHint = (name: string, hints: readonly string[]) => hints.some((hint) => name.toLowerCase().includes(hint));

export type ColumnRoleMap = Record<ColumnRole, BoardColumn | null>;

/**
 * Which column does each job on this board.
 *
 * A role the board set wins outright. Where it set none, the guess that was
 * there before runs: the first column of a type that can do the job, or the
 * first one whose name hints at it. So a board that has never heard of roles
 * behaves exactly as it did, and one that sets a single role fixes only the
 * thing it was getting wrong.
 *
 * A role set on a column whose type cannot do the job is ignored rather than
 * honoured — a column's type can be nothing else, but a role is a note that can
 * go stale.
 */
export function resolveColumnRoles(columns: readonly BoardColumn[]): ColumnRoleMap {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  const map = {} as ColumnRoleMap;

  for (const role of COLUMN_ROLES) {
    const chosen = ordered.find((column) => column.role === role && columnRoleTypes(role).includes(column.type));
    if (chosen) {
      map[role] = chosen;
      continue;
    }
    // No answer from the board, so fall back to the old guess. A column the
    // board gave a *different* job to is not a candidate: it has already said
    // what that one is for.
    const free = ordered.filter((column) => !column.role || column.role === role);
    const hints = roleNameHints(role);
    const { implied, hinted } = ROLE_TYPES[role];
    let found: BoardColumn | undefined;
    for (const type of implied) {
      found = free.find((column) => column.type === type);
      if (found) break;
    }
    if (!found && hints.length > 0) {
      for (const type of hinted) {
        found = free.find((column) => column.type === type && hasHint(column.name, hints));
        if (found) break;
      }
    }
    map[role] = found ?? null;
  }

  return map;
}

/**
 * Boards where the guess has more than one column to choose from.
 *
 * Used to point out, at the moment a second one is added, that the board should
 * say which it means rather than letting position decide.
 */
export function ambiguousRoles(columns: readonly BoardColumn[]): ColumnRole[] {
  return COLUMN_ROLES.filter((role) => {
    if (columns.some((column) => column.role === role)) return false;
    const { implied, hinted } = ROLE_TYPES[role];
    const hints = roleNameHints(role);
    const candidates = columns.filter(
      (column) => !column.role && (implied.includes(column.type) || (hinted.includes(column.type) && hasHint(column.name, hints))),
    );
    return candidates.length > 1;
  });
}
