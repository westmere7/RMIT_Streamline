/**
 * Mentions of many people at once: "@all" for everyone active in the
 * workspace, "@task" for the people on the task (its person columns and the
 * people in charge of its deliverables), "@board" for the board's members.
 * Written and stored as plain "@all" / "@task" / "@board", and turned into
 * people only when somebody is to be told.
 */
export const GROUP_MENTIONS = [
  { key: "all", hint: "Everyone in this workspace" },
  { key: "task", hint: "Everyone on this task" },
  { key: "board", hint: "Everyone on this board" },
] as const;

export type GroupMentionKey = (typeof GROUP_MENTIONS)[number]["key"];

/** The words as written after "@", for the editor and the renderer to treat as mentions. */
export const GROUP_MENTION_NAMES: readonly string[] = GROUP_MENTIONS.map((g) => g.key);

const GROUP_PATTERN = /(^|[^\p{L}\p{N}_@])@(all|task|board)(?![\p{L}\p{N}_])/giu;

/**
 * The group mentions in a body. `personNames` are display names that can be
 * mentioned: a person's own mention is read first, so "@Task Force" stays a
 * mention of the person called Task Force, not of everyone on the task.
 */
export function groupMentionsIn(body: string, personNames: readonly string[] = []): GroupMentionKey[] {
  let rest = body;
  for (const name of [...personNames].filter((n) => n.trim()).sort((a, b) => b.length - a.length)) {
    rest = rest.split(`@${name}`).join(" ");
  }
  const found = new Set<GroupMentionKey>();
  for (const match of rest.matchAll(GROUP_PATTERN)) found.add(match[2]!.toLowerCase() as GroupMentionKey);
  return [...found];
}
