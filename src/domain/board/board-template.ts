import type { AutomationRule } from "@/domain/automation/automation";
import type { Board, BoardGroup } from "@/domain/board/board";
import type { BoardColumn } from "@/domain/board/column";
import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";
import type { Item } from "@/domain/item/item";

/**
 * A board's layout saved under a name, for new boards to start from.
 *
 * The columns always come with it: they are what a layout is. Everything else
 * is chosen when it is saved (`TEMPLATE_PARTS`). A template never holds what
 * is in the tasks — no values, people, dates or files — only, when asked, the
 * task names as a starting list.
 *
 * Groups and columns keep the ids they had on the board they came from, as
 * `key`. An automation refers to its columns and groups by id, so a board made
 * from the template swaps each key for the new id and the rule points at the
 * right place.
 */

export const TEMPLATE_PARTS = ["groups", "columnSettings", "layout", "automations", "tasks", "look"] as const;
export type BoardTemplatePart = (typeof TEMPLATE_PARTS)[number];

export const TEMPLATE_PART_INFO: Record<BoardTemplatePart, { label: string; hint: string }> = {
  groups: { label: "Groups", hint: "Their names, colours and order." },
  columnSettings: { label: "Column settings", hint: "Status and dropdown labels, tags, number and date formats." },
  layout: { label: "Widths and hidden columns", hint: "How wide each column is, and which are hidden or removed." },
  automations: { label: "Automations", hint: "Needs groups and column settings, which the rules point at." },
  tasks: { label: "Task names", hint: "As a starting list, with subitems. Nothing that is in them." },
  look: { label: "Colour, icon and description", hint: "Offered for the new board, and still yours to change." },
};

/** What a new template saves unless told otherwise. */
export const DEFAULT_TEMPLATE_PARTS: readonly BoardTemplatePart[] = ["groups", "columnSettings", "layout", "look"];

export interface BoardTemplateSpec {
  version: 1;
  parts: BoardTemplatePart[];
  board: { description: string | null; color: ColorToken; icon: string } | null;
  groups: Array<{ key: EntityId; name: string; color: ColorToken }>;
  columns: Array<Pick<BoardColumn, "name" | "type"> & Partial<Pick<BoardColumn, "settings" | "width" | "hidden" | "hiddenInPanel" | "role" | "removed">> & { key: EntityId }>;
  automations: Array<Pick<AutomationRule, "name" | "enabled" | "trigger" | "conditionMatch" | "conditions" | "actions">>;
  tasks: Array<{ groupKey: EntityId; name: string; subitems: string[] }>;
}

export interface SavedBoardTemplate extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  name: string;
  description: string | null;
  spec: BoardTemplateSpec;
  createdBy: EntityId;
}

export type SavedBoardTemplateInput = Pick<SavedBoardTemplate, "workspaceId" | "name" | "description" | "spec" | "createdBy">;

/** Automations point at groups and at labels, so they only travel with both. */
export function normaliseTemplateParts(parts: readonly BoardTemplatePart[]): BoardTemplatePart[] {
  const chosen = new Set(parts);
  if (chosen.has("automations") && !(chosen.has("groups") && chosen.has("columnSettings"))) chosen.delete("automations");
  return TEMPLATE_PARTS.filter((part) => chosen.has(part));
}

/** The board as a template, holding only the parts asked for. */
export function buildBoardTemplateSpec(
  source: { board: Pick<Board, "description" | "color" | "icon">; groups: readonly BoardGroup[]; columns: readonly BoardColumn[]; rules: readonly AutomationRule[]; items: readonly Item[] },
  requested: readonly BoardTemplatePart[],
): BoardTemplateSpec {
  const parts = normaliseTemplateParts(requested);
  const has = (part: BoardTemplatePart) => parts.includes(part);
  const groups = [...source.groups].sort((a, b) => a.position - b.position);
  // A special column taken off the board travels only as part of the layout, so
  // the new board takes it off too; without the layout it arrives showing.
  const columns = [...source.columns].sort((a, b) => a.position - b.position).filter((c) => has("layout") || !c.removed);
  const keys = new Set([...groups.map((g) => g.id), ...columns.map((c) => c.id)]);

  const topLevel = source.items.filter((i) => i.parentItemId === null && !i.archivedAt);
  const byParent = new Map<string, Item[]>();
  for (const item of source.items) {
    if (!item.parentItemId || item.archivedAt) continue;
    byParent.set(item.parentItemId, [...(byParent.get(item.parentItemId) ?? []), item]);
  }
  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));

  return {
    version: 1,
    parts,
    board: has("look") ? { description: source.board.description ?? null, color: source.board.color, icon: source.board.icon } : null,
    groups: has("groups") ? groups.map((g) => ({ key: g.id, name: g.name, color: g.color })) : [],
    columns: columns.map((c) => ({
      key: c.id,
      name: c.name,
      type: c.type,
      role: c.role ?? null,
      ...(has("columnSettings") ? { settings: c.settings } : {}),
      ...(has("layout") ? { width: c.width, hidden: c.hidden, hiddenInPanel: c.hiddenInPanel ?? false, removed: c.removed ?? false } : {}),
    })),
    // Only rules whose every id is one the template carries: a rule about a
    // column left behind would arrive pointing at nothing.
    automations: has("automations")
      ? source.rules.filter((rule) => referencedIds(rule).every((id) => keys.has(id) || !looksLikeBoardId(id, source))).map((rule) => ({ name: rule.name, enabled: rule.enabled, trigger: rule.trigger, conditionMatch: rule.conditionMatch, conditions: rule.conditions, actions: rule.actions }))
      : [],
    tasks: has("tasks")
      ? topLevel
          .sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) || a.position - b.position)
          .map((item) => ({ groupKey: item.groupId, name: item.name, subitems: (byParent.get(item.id) ?? []).sort((a, b) => a.position - b.position).map((s) => s.name) }))
      : [],
  };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function referencedIds(rule: AutomationRule): string[] {
  return JSON.stringify([rule.trigger, rule.conditions, rule.actions]).match(UUID) ?? [];
}

/** An id that belongs to the board (a column or group of it) rather than to a person or a label. */
function looksLikeBoardId(id: string, source: { groups: readonly BoardGroup[]; columns: readonly BoardColumn[] }): boolean {
  return source.groups.some((g) => g.id === id) || source.columns.some((c) => c.id === id);
}

/** A saved rule's parts with every template key swapped for the id it has on the new board. */
export function remapTemplateIds<T>(value: T, ids: ReadonlyMap<string, string>): T {
  const json = JSON.stringify(value).replace(UUID, (id) => ids.get(id) ?? id);
  return JSON.parse(json) as T;
}

/** "6 groups · 12 columns · 3 automations · 40 tasks", for the template picker. */
export function describeTemplateSpec(spec: BoardTemplateSpec): string {
  const bits = [
    spec.groups.length ? `${spec.groups.length} group${spec.groups.length === 1 ? "" : "s"}` : null,
    `${spec.columns.filter((c) => !c.removed).length + 1} columns`,
    spec.automations.length ? `${spec.automations.length} automation${spec.automations.length === 1 ? "" : "s"}` : null,
    spec.tasks.length ? `${spec.tasks.length} task${spec.tasks.length === 1 ? "" : "s"}` : null,
  ];
  return bits.filter(Boolean).join(" · ");
}
