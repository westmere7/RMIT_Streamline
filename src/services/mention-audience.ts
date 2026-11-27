import type { Board, EntityId, Item, User } from "@/domain";
import { groupMentionsIn } from "@/domain";
import type { Repositories } from "@/data/repositories";

/** People named "@Display Name" in a body, from those given. */
export function extractMentions(body: string, users: readonly User[]): EntityId[] {
  const ids: EntityId[] = [];
  // Longest names first, each "@" claimed once, and a name must end where a
  // word does: "@Ann" is not a mention of Ann inside "@Anna Lee", nor is "@Ann
  // Lee" also a mention of Ann.
  const claimed = new Set<number>();
  const byLength = users.filter((u) => u.displayName.trim()).slice().sort((a, b) => b.displayName.length - a.displayName.length);
  for (const user of byLength) {
    const needle = `@${user.displayName}`;
    for (let at = body.indexOf(needle); at !== -1; at = body.indexOf(needle, at + 1)) {
      if (claimed.has(at) || /[\p{L}\p{N}]/u.test(body.charAt(at + needle.length))) continue;
      claimed.add(at);
      if (!ids.includes(user.id)) ids.push(user.id);
    }
  }
  return ids;
}

/**
 * Everybody a body mentions on a task: each "@Name", and the people behind
 * "@all" (the workspace), "@task" (the task's person columns and the people in
 * charge of its deliverables) and "@board" (the board's members). Only people
 * active in the task's workspace, whoever the caller hands over.
 */
export async function mentionAudience(repos: Repositories, body: string, users: readonly User[], item: Item, board: Board | null): Promise<EntityId[]> {
  if (!board) return [];
  const members = await repos.workspaces.listMembers(board.workspaceId);
  const active = new Set(members.filter((m) => m.status === "ACTIVE").map((m) => m.userId));
  const reachable = users.filter((u) => active.has(u.id));
  const people = new Set(extractMentions(body, reachable));
  const groups = groupMentionsIn(body, reachable.map((u) => u.displayName));
  if (groups.includes("all")) for (const id of active) people.add(id);
  if (groups.includes("task")) {
    const [columns, values, assets] = await Promise.all([repos.boards.listColumns(board.id), repos.items.listValuesByItem(item.id), repos.itemAssets.listByItem(item.id)]);
    const personColumns = new Set(columns.filter((c) => c.type === "PERSON" || c.type === "PEOPLE").map((c) => c.id));
    for (const value of values) {
      if (!personColumns.has(value.columnId)) continue;
      if (value.value.type === "PERSON" || value.value.type === "PEOPLE") for (const id of value.value.userIds) people.add(id);
    }
    for (const asset of assets) for (const id of asset.assigneeIds) people.add(id);
  }
  if (groups.includes("board")) for (const member of await repos.boards.listMembers(board.id)) people.add(member.userId);
  return [...people].filter((id) => active.has(id));
}
