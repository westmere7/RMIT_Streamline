import type { BoardColumn, ColumnLabel, ColumnValue, EntityId, Item, PortalColumnEntry, PortalPerson, TagOption, User } from "@/domain";
import { columnTagOptions, isPortalBuiltInKey, portalColumnKeyFor } from "@/domain";
import type { BoardContext } from "./portal-projection";
import { toPortalPerson } from "./portal-projection";

/**
 * The boards' own columns the portal has been told to show, merged into one
 * column each and read off every request.
 *
 * Only columns switched on in the layout are read at all, so a board column the
 * team has not chosen to publish never enters the payload. Labels and tags are
 * merged by their words, the way statuses are: two boards' "Reel" in a Format
 * dropdown are one label on the portal, whatever ids each board gave them.
 */
export interface PortalExtraColumn {
  key: string;
  name: string;
  type: BoardColumn["type"];
  settings: BoardColumn["settings"];
  width: number;
}

export interface PortalExtras {
  columns: PortalExtraColumn[];
  /** itemId → key → value, for the requests that have one. */
  values: Map<EntityId, Map<string, ColumnValue>>;
  /** People named in a carried people column, to be shown by name and avatar like an assignee. */
  people: PortalPerson[];
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "label";
}

export function projectPortalExtras(layout: readonly PortalColumnEntry[], boards: Map<string, BoardContext>, items: readonly Item[], usersById: Map<string, User>): PortalExtras {
  const keys = layout.filter((entry) => !entry.hidden && !isPortalBuiltInKey(entry.key)).map((entry) => entry.key);
  const empty: PortalExtras = { columns: [], values: new Map(), people: [] };
  if (keys.length === 0) return empty;

  // Each key's column on each board that has one.
  const byKey = new Map<string, Map<string, BoardColumn>>();
  for (const [boardId, context] of boards) {
    for (const column of context.columns) {
      if (column.removed) continue;
      const key = portalColumnKeyFor(column);
      if (!key || !keys.includes(key)) continue;
      const perBoard = byKey.get(key) ?? new Map<string, BoardColumn>();
      if (!perBoard.has(boardId)) perBoard.set(boardId, column);
      byKey.set(key, perBoard);
    }
  }

  const columns: PortalExtraColumn[] = [];
  // Per key, how a board's value becomes the portal's.
  const translate = new Map<string, (value: ColumnValue, source: BoardColumn) => ColumnValue | null>();
  for (const key of keys) {
    const sources = [...(byKey.get(key)?.values() ?? [])];
    const first = sources[0];
    if (!first) continue;
    let settings: BoardColumn["settings"] = first.settings;
    let convert: (value: ColumnValue, source: BoardColumn) => ColumnValue | null = (value) => value;
    if (first.type === "DROPDOWN") {
      const labels = new Map<string, ColumnLabel>();
      for (const source of sources) {
        if (source.settings.kind !== "dropdown") continue;
        for (const label of source.settings.labels) if (!labels.has(label.name.trim().toLowerCase())) labels.set(label.name.trim().toLowerCase(), { id: `dd-${slug(label.name)}`, name: label.name, color: label.color });
      }
      settings = { kind: "dropdown", labels: [...labels.values()], defaultLabelId: null };
      convert = (value, source) => {
        if (value.type !== "DROPDOWN" || source.settings.kind !== "dropdown") return null;
        const label = source.settings.labels.find((l) => l.id === value.labelId);
        return { type: "DROPDOWN", labelId: label ? (labels.get(label.name.trim().toLowerCase())?.id ?? null) : null };
      };
    } else if (first.type === "TAGS") {
      const options = new Map<string, TagOption>();
      for (const source of sources) for (const option of columnTagOptions(source)) if (!options.has(option.name.toLowerCase())) options.set(option.name.toLowerCase(), option);
      settings = { kind: "tags", options: [...options.values()] };
    }
    translate.set(key, convert);
    columns.push({ key, name: first.name, type: first.type, settings, width: first.width });
  }

  const values = new Map<EntityId, Map<string, ColumnValue>>();
  const people = new Map<EntityId, PortalPerson>();
  for (const item of items) {
    const context = boards.get(item.boardId);
    const row = context?.values.get(item.id);
    if (!context || !row) continue;
    for (const column of columns) {
      const source = byKey.get(column.key)?.get(item.boardId);
      const raw = source ? row.get(source.id) : undefined;
      if (!source || !raw) continue;
      let value = translate.get(column.key)!(raw, source);
      if (!value) continue;
      // A people value is published as the people it names who are known here, and nobody else.
      if (value.type === "PEOPLE" || value.type === "REQUESTER") {
        const known = value.userIds.filter((id) => usersById.has(id));
        for (const id of known) if (!people.has(id)) people.set(id, toPortalPerson(usersById.get(id)!));
        value = { ...value, userIds: known };
      }
      const perItem = values.get(item.id) ?? new Map<string, ColumnValue>();
      perItem.set(column.key, value);
      values.set(item.id, perItem);
    }
  }
  return { columns, values, people: [...people.values()] };
}
