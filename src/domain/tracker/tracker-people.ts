import { resolvePeople, type AssetPerson } from "@/domain/tracker/tracker-assets";
import { personIds, personValue, type TrackerCellValue } from "@/domain/tracker/tracker";

/**
 * Who a People cell can name.
 *
 * A People cell stores user ids; everything that shows or exports one (the
 * grid, search, sort, CSV, the Excel workbook) shows names instead, and
 * everything that takes text in (typing, pasting, importing) turns names back
 * into ids. The workspace's members are set here once, by the tracker page,
 * rather than threaded through every pure function that formats a cell.
 * Outside the app (tests, the server) it is whatever was set last.
 */
let directory: readonly AssetPerson[] = [];
let byId = new Map<string, string>();

export function setTrackerPeople(people: readonly AssetPerson[]): void {
  directory = people;
  byId = new Map();
  for (const person of people) if (!byId.has(person.id)) byId.set(person.id, person.name);
}

export function trackerPeople(): readonly AssetPerson[] {
  return directory;
}

/** A person's name, or a placeholder for somebody no longer in the directory. */
export function trackerPersonName(id: string): string {
  return byId.get(id) ?? "Former member";
}

/** "Jane Morrison, Tom Hartley". */
export function personNames(value: TrackerCellValue | undefined): string {
  return personIds(value).map(trackerPersonName).join(", ");
}

/** A People cell's text (ids, names or emails, comma separated) as the ids of the people it names. */
export function coercePeople(raw: string, people: readonly AssetPerson[] = directory): string | null {
  const ids: string[] = [];
  for (const token of raw.split(/[,;\n]/)) {
    const part = token.trim();
    if (!part) continue;
    const known = people.find((p) => p.id === part);
    if (known) ids.push(known.id);
    else if (people.length === 0 && /^[0-9a-f-]{20,}$/i.test(part)) ids.push(part);
    else ids.push(...resolvePeople(part, people));
  }
  return personValue(ids);
}
