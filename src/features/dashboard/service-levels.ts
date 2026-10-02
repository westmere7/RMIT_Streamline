import type { DashboardFacts, StatusBucket, TaskFact } from "./analytics";
import { finishedIn, median, medianTurnaround, onTimeShare, sentBackShare } from "./flow";
import { departmentHex, inRange, type ResolvedPeriod } from "./metrics";

/**
 * Two readings of open work that the delivery figures do not give: how long
 * each task has sat where it is (aging), and how each requesting department is
 * being served (service levels). Both read the same facts as the rest of the
 * page, and the team filter applies as it does everywhere else.
 */

const DAY_MS = 86_400_000;

const inTeams = (task: TaskFact, teamIds: string[] | null) => teamIds === null || teamIds.includes(task.team.id);

/** How long a task has been in its current status, in days, from its status history (since it was made, if it never moved). */
export function daysInStatus(task: TaskFact, now: number): number {
  const last = task.flow.spans[task.flow.spans.length - 1];
  const since = last && last.to === null ? last.from : task.flow.createdAt;
  return Math.max(0, (now - Date.parse(since)) / DAY_MS);
}

/** The bands open work is sorted into. The Kanban's age chips start at the second and turn amber and red at the third and fourth. */
export const AGE_BANDS = [
  { key: "fresh", label: "Under 3 days", below: 3 },
  { key: "settling", label: "3 to 6 days", below: 7 },
  { key: "aging", label: "1 to 2 weeks", below: 14 },
  { key: "stale", label: "2 weeks or more", below: Infinity },
] as const;

export interface AgingRow {
  /** The status, by name. */
  label: string;
  role: StatusBucket;
  /** The tasks in each of AGE_BANDS, in order. */
  bands: TaskFact[][];
  total: number;
  /** Days the longest-waiting task has been here. */
  oldest: number;
}

/**
 * Open work, status by status, by how long each task has sat in it. A status
 * holding a lot of old work is where things stall, whether or not anyone
 * marked them stuck. Statuses with most work waiting a week or more first.
 */
export function aging(facts: DashboardFacts, teamIds: string[] | null, now: number): AgingRow[] {
  const rows = new Map<string, AgingRow>();
  for (const task of facts.tasks) {
    if (task.isDone || !inTeams(task, teamIds)) continue;
    const last = task.flow.spans[task.flow.spans.length - 1];
    const label = (last && last.to === null ? last.label : task.statusLabel) ?? "No status";
    const role = last && last.to === null ? last.role : task.status;
    const days = daysInStatus(task, now);
    const row = rows.get(label) ?? { label, role, bands: AGE_BANDS.map(() => []), total: 0, oldest: 0 };
    row.bands[AGE_BANDS.findIndex((band) => days < band.below)]!.push(task);
    row.total += 1;
    row.oldest = Math.max(row.oldest, days);
    rows.set(label, row);
  }
  const old = (row: AgingRow) => row.bands[2]!.length + row.bands[3]!.length;
  return [...rows.values()].sort((a, b) => old(b) - old(a) || b.total - a.total || a.label.localeCompare(b.label));
}

export interface DepartmentServiceRow {
  key: string;
  name: string;
  color: string;
  /** Its work in hand on the boards now. */
  open: TaskFact[];
  /** Its requests still waiting to be placed on a board. */
  waiting: TaskFact[];
  /** Its work finished in the period. */
  finished: TaskFact[];
  /** Median days from made to done, for that finished work. */
  turnaround: number | null;
  /** Share of that finished work with a due date done by it, in per cent. */
  onTime: number | null;
  /** Share of that finished work that went back at least once, in per cent. */
  sentBack: number | null;
  /** Median days from a task being made to its first change of status: how long it waits to be picked up. */
  firstMove: number | null;
  /** Days the longest-open task has been open. */
  oldestOpen: number | null;
}

/**
 * How each department is being served: what it has in hand and waiting, how
 * fast and how reliably its work comes back, and how long its requests wait
 * before anyone picks them up. Open and waiting are as of now; the rest is the
 * period's. Work that names no department is left out.
 */
export function departmentService(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null, now: number): DepartmentServiceRow[] {
  const rows = new Map<string, DepartmentServiceRow & { started: TaskFact[] }>();
  const rowFor = (task: TaskFact) => {
    const name = task.department?.name.trim();
    if (!name) return null;
    const key = name.toLowerCase();
    const row = rows.get(key) ?? { key, name, color: departmentHex(name), open: [], waiting: [], finished: [], started: [], turnaround: null, onTime: null, sentBack: null, firstMove: null, oldestOpen: null };
    rows.set(key, row);
    return row;
  };
  for (const task of facts.tasks) {
    if (!inTeams(task, teamIds)) continue;
    if (!task.isDone) rowFor(task)?.open.push(task);
    if (inRange(task.createdAt, period.current)) rowFor(task)?.started.push(task);
  }
  for (const task of finishedIn(facts, period.current, teamIds)) rowFor(task)?.finished.push(task);
  // Requests on the intake board are not anyone's work yet, so they are counted apart.
  for (const request of facts.requests) {
    if (request.isIntake && !request.isDone && request.request?.stage !== "closed") rowFor(request)?.waiting.push(request);
  }
  return [...rows.values()]
    .map(({ started, ...row }) => {
      const firstMoves = started.flatMap((t) => {
        const at = t.flow.spans[0]?.to;
        return at ? [Math.max(0, (Date.parse(at) - Date.parse(t.flow.createdAt)) / DAY_MS)] : [];
      });
      return {
        ...row,
        turnaround: medianTurnaround(row.finished),
        onTime: onTimeShare(row.finished),
        sentBack: sentBackShare(row.finished),
        firstMove: median(firstMoves),
        oldestOpen: row.open.length ? Math.max(...row.open.map((t) => (now - Date.parse(t.flow.createdAt)) / DAY_MS)) : null,
      };
    })
    .filter((row) => row.open.length + row.waiting.length + row.finished.length > 0)
    .sort((a, b) => b.open.length + b.waiting.length - (a.open.length + a.waiting.length) || b.finished.length - a.finished.length || a.name.localeCompare(b.name));
}
