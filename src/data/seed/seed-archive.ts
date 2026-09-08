import { addBusinessDays, addDays, addHours, addMinutes, differenceInCalendarDays, isWeekend, startOfDay } from "date-fns";
import type { Activity, BoardColumn, BoardGroup, ColumnValue, Item, ItemAsset } from "@/domain";
import { recapAssets, recapColumnValue } from "@/domain";
import { toISODate } from "@/lib/dates/dates";
import { ARCHIVE_BOARDS, Rng, hashKey, type HistoryBoardSpec } from "./seed-history";
import type { SeedExtrasContext } from "./seed-extras";
import { emptySeedBundle, type SeedBundle, type UserKey } from "./seed-data";

/**
 * A closed year of delivered work, so the dashboard has a full past to measure
 * this year against.
 *
 * The generated history (seed-history.ts) covers about five months either side of
 * today, which leaves every year-over-year figure with no baseline and the
 * calendar with one busy stretch. This adds the year before last January: two
 * semesters of work on the same boards, nearly all of it finished, with asset
 * lines that carry a completion date so "counted by completed date" and the
 * on-time rate have something to report.
 *
 * Deliberately simpler than seed-history: a closed year needs no chains,
 * subitems, updates or notifications, only what the reports read — who
 * delivered, what, for whom, when it was due and when it was done. Ids come from
 * the "archive…" namespaces so this bundle can be added to a database that
 * already holds the rest without shifting a single existing id, and boards,
 * groups and columns are reached through the lookups so the additive top-up
 * (scripts/db-seed-topup.mts) can translate them by name.
 */

/** Which year of work this is. */
export const ARCHIVE_YEAR = 2025;

const ARCHIVE_SEED = 0x5eed2025;

/** The two halves of the academic year, each drawing its own slice of every board's work. */
const PERIODS = [
  { label: `Sem 1 ${ARCHIVE_YEAR}`, months: [0, 5] as const, share: 0.62 },
  { label: `Sem 2 ${ARCHIVE_YEAR}`, months: [6, 11] as const, share: 0.62 },
];

/**
 * How busy each month of the year was, as a weight. RMIT's peaks are the run-up
 * to Semester 1 (Feb) and to Semester 2 with Open Day behind it (Jul–Aug), with
 * January and the December shutdown quiet — so the workload chart has a shape
 * rather than a flat line.
 */
const MONTH_WEIGHTS = [4, 11, 12, 8, 7, 6, 12, 13, 9, 7, 6, 3];

type StatusId = "not_started" | "working" | "waiting" | "stuck" | "done";

const STATUS_NAMES: Record<StatusId, string> = { not_started: "Not Started", working: "In Progress", waiting: "Waiting", stuck: "Stuck", done: "Done" };

export function buildSeedArchive(ctx: SeedExtrasContext): SeedBundle {
  const { workspaceId, sid, users, boards, lookups } = ctx;
  const bundle = emptySeedBundle();
  const iso = (d: Date) => d.toISOString();

  const pushValue = (itemId: string, column: BoardColumn | null | undefined, value: ColumnValue | null, at: Date) => {
    if (!column || value === null) return;
    bundle.itemColumnValues.push({ id: sid("archiveValue"), itemId, columnId: column.id, value, updatedAt: iso(at) });
  };
  const activity = (a: Omit<Activity, "id" | "workspaceId">) => bundle.activities.push({ ...a, id: sid("archiveActivity"), workspaceId });

  // Positions start well past the generated history's, so an archived item never
  // lands between two of this year's rows.
  const positions = new Map<string, number>();
  const nextPosition = (groupId: string) => {
    const position = positions.get(groupId) ?? 5000;
    positions.set(groupId, position + 1);
    return position;
  };

  for (const spec of ARCHIVE_BOARDS) {
    const rng = new Rng(ARCHIVE_SEED ^ hashKey(spec.board));
    const boardId = boards[spec.board];
    const boardName = lookups.boardName(spec.board);
    const groups = lookups.groups(spec.board);
    const column = (key: string) => lookups.column(spec.board, key);
    const columns = lookups.columns(spec.board);
    const hasTimeline = column("timeline") !== null;
    const hasDue = column("due") !== null;
    const tagsColumn = column("channel") ?? column("market");
    const recapColumn = columns.find((c) => c.type === "ASSETS_RECAP") ?? null;
    const sizeColumn = columns.find((c) => c.type === "SIZE") ?? null;
    const groupByName = (names: string[]): BoardGroup => {
      const wanted = rng.pick(names);
      return groups.find((g) => g.name === wanted) ?? groups[groups.length - 1]!;
    };

    const peopleWeights = spec.people.map((key, index) => [key, index < spec.busy ? 3 : 1] as const);
    const pickOwners = (): UserKey[] => {
      const first = rng.weighted(peopleWeights);
      if (!rng.chance(0.3) || spec.people.length < 2) return [first];
      return [first, rng.pick(spec.people.filter((p) => p !== first))];
    };
    /** A working day in the given month range, chosen against the seasonal weights. */
    const startDay = (months: readonly [number, number]): Date => {
      const choices = MONTH_WEIGHTS.map((weight, month) => [month, month >= months[0] && month <= months[1] ? weight : 0] as const);
      const month = rng.weighted(choices);
      const day = new Date(ARCHIVE_YEAR, month, rng.int(1, 28));
      return isWeekend(day) ? addBusinessDays(day, 1) : day;
    };
    const workTime = (day: Date, fromHour = 8, toHour = 18): Date => addMinutes(addHours(startOfDay(day), rng.int(fromHour, toHour)), rng.int(0, 59));

    for (const period of PERIODS) {
      // A slice of the board's work each half, so the year reads as recurring
      // work rather than the same list twice.
      const names = spec.names.filter(() => rng.chance(period.share));
      for (const named of names) {
        const base = typeof named === "string" ? named : named[0];
        const name = `${base} · ${period.label}`;
        const tags = typeof named === "string" ? (spec.tags?.length ? [rng.pick(spec.tags)] : null) : named.slice(1);

        const start = startDay(period.months);
        const days = spec.big?.test(base) ? rng.int(10, 20) : rng.weighted([[rng.int(2, 5), 45], [rng.int(6, 10), 35], [rng.int(11, 20), 20]]);
        const end = addBusinessDays(start, days - 1);
        // A closed year is nearly all delivered; what is left is the work that
        // stalled and was never picked up again.
        const status = rng.weighted<StatusId>([["done", 90], ["stuck", 5], ["waiting", 3], ["not_started", 2]]);
        const done = status === "done";
        // Most work landed on or before its due date; some ran over.
        const finished = done ? addBusinessDays(end, rng.weighted([[0, 55], [rng.int(1, 3), 25], [rng.int(4, 10), 20]])) : null;
        const dueDate = hasDue && rng.chance(0.9) ? toISODate(addDays(end, rng.chance(0.75) ? 0 : rng.int(1, 4))) : null;
        const owners = pickOwners();
        const requester = spec.requesters ? rng.pick(spec.requesters) : null;
        const creator: UserKey = requester ?? rng.pick(spec.people);
        const created = workTime(addDays(start, -rng.int(2, 15)));
        const touched = finished ? workTime(finished, 14, 19) : workTime(addDays(end, rng.int(0, 5)), 9, 17);
        const group = groupByName(done ? spec.phases.past : spec.phases.present);

        const item: Item = {
          id: sid("archiveItem"),
          boardId,
          groupId: group.id,
          parentItemId: null,
          name,
          description: spec.descriptions && rng.chance(0.2) ? rng.pick(spec.descriptions) : null,
          position: nextPosition(group.id),
          createdBy: users[creator],
          archivedAt: null,
          createdAt: iso(created),
          updatedAt: iso(touched),
        };
        bundle.items.push(item);
        activity({ boardId, itemId: item.id, actorId: item.createdBy, eventType: "ITEM_CREATED", metadata: { itemName: name, boardName, groupName: group.name }, createdAt: iso(created) });
        if (done) {
          activity({
            boardId,
            itemId: item.id,
            actorId: users[owners[0]!],
            eventType: "ITEM_COLUMN_VALUE_UPDATED",
            metadata: { itemName: name, columnName: column("status")?.name ?? "Status", columnType: "STATUS", from: STATUS_NAMES.working, to: STATUS_NAMES.done },
            createdAt: iso(touched),
          });
        }

        pushValue(item.id, column("owner"), { type: "PERSON", userIds: owners.map((k) => users[k]) }, created);
        if (requester) pushValue(item.id, column("requester"), { type: "PERSON", userIds: [users[requester]] }, created);
        pushValue(item.id, column("status"), { type: "STATUS", labelId: status }, touched);
        pushValue(item.id, column("priority"), { type: "PRIORITY", labelId: rng.weighted([["medium", 40], ["high", 30], ["low", 20], ["critical", 10]]) }, created);
        if (hasTimeline && rng.chance(0.85)) pushValue(item.id, column("timeline"), { type: "TIMELINE", start: toISODate(start), end: toISODate(end) }, created);
        if (dueDate) pushValue(item.id, column("due"), { type: "DATE", date: dueDate }, created);
        if (tags && tagsColumn) pushValue(item.id, tagsColumn, { type: "TAGS", tags }, created);
        for (const [key, { pool, chance }] of Object.entries(spec.texts ?? {})) {
          const target = column(key);
          if (!target || !rng.chance(chance)) continue;
          const text = rng.pick(pool);
          pushValue(item.id, target, target.type === "LONG_TEXT" ? { type: "LONG_TEXT", text } : { type: "TEXT", text }, created);
        }
        for (const [key, make] of Object.entries(spec.numbers ?? {})) pushValue(item.id, column(key), { type: "NUMBER", number: make(rng) }, created);
        if (spec.checkbox) pushValue(item.id, column(spec.checkbox), { type: "CHECKBOX", checked: done ? rng.chance(0.95) : rng.chance(0.5) }, touched);
        if (sizeColumn) {
          const span = differenceInCalendarDays(end, start) + 1;
          pushValue(item.id, sizeColumn, { type: "SIZE", size: span <= 3 ? "XS" : span <= 7 ? "S" : span <= 14 ? "M" : span <= 21 ? "L" : "XL" }, created);
        }

        // Deliverables: most archived work has its list, and a delivered line
        // carries the day it was ticked off — the reports count by that date.
        if (spec.assets.length && rng.chance(0.75)) {
          const count = rng.int(1, Math.min(4, spec.assets.length));
          const offset = rng.int(0, spec.assets.length - count);
          const lines: ItemAsset[] = spec.assets.slice(offset, offset + count).map((line, index) => ({
            id: sid("archiveAsset"),
            itemId: item.id,
            boardId,
            name: line.name,
            assetType: line.type,
            quantity: line.qty ? rng.int(line.qty[0], line.qty[1]) : null,
            assigneeIds: rng.chance(0.85) ? [users[owners[index % owners.length]!]!] : [],
            dueDate,
            completedAt: done ? iso(touched) : rng.chance(0.35) ? iso(touched) : null,
            notes: line.notes,
            position: index,
            createdBy: item.createdBy,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }));
          bundle.itemAssets.push(...lines);
          pushValue(item.id, recapColumn, recapColumnValue(recapAssets(lines, toISODate(new Date(ARCHIVE_YEAR, 11, 31)))), touched);
        }
      }
    }
  }

  return bundle;
}

/** What the archive adds, for the seed's own reporting. */
export function summariseArchive(bundle: SeedBundle): { items: number; values: number; assets: number; units: number; activities: number } {
  return {
    items: bundle.items.length,
    values: bundle.itemColumnValues.length,
    assets: bundle.itemAssets.length,
    units: bundle.itemAssets.reduce((sum, a) => sum + (a.quantity ?? 1), 0),
    activities: bundle.activities.length,
  };
}

export type { HistoryBoardSpec };
