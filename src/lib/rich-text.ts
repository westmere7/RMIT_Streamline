/**
 * The small markup an update is written in.
 *
 * It is a subset of Markdown, chosen so that an update written before any of
 * this existed still reads exactly as it did, and so that what is stored stays
 * legible in the database and in a search result:
 *
 *   **bold**            *italic*            __underlined__
 *   # Heading           ## Subheading
 *   - bullet            1. numbered
 *   - [ ] checklist     a box anyone on the task can tick (see checklistKey)
 *   [text](https://…)   bare https://… addresses
 *   {c:red}coloured{/c} from a fixed palette
 *   @Full Name          mentions, matched against the workspace
 *
 * Parsing produces plain data — never HTML — and the renderer turns that data
 * into React elements, so nothing a person types can become markup.
 */

export const RICH_TEXT_COLORS = ["red", "orange", "green", "blue", "purple", "grey"] as const;
export type RichTextColor = (typeof RICH_TEXT_COLORS)[number];

export function isRichTextColor(value: string): value is RichTextColor {
  return (RICH_TEXT_COLORS as readonly string[]).includes(value);
}

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "color"; color: RichTextColor; children: InlineNode[] }
  | { type: "link"; href: string; label: string }
  | { type: "mention"; name: string };

/**
 * How far a block is pushed in from the left, in steps of one Tab.
 *
 * Three steps, which is as much as a document this small can carry before the
 * indentation says more about the person typing than about the text. Stored as
 * two spaces a step, so what is in the database still reads as the shape it is.
 */
export const MAX_INDENT = 3;
const INDENT_SPACES = 2;

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[]; indent?: number }
  | { type: "heading"; level: 1 | 2; children: InlineNode[]; indent?: number }
  | { type: "list"; ordered: boolean; items: InlineNode[][]; indent?: number }
  /** Boxes to tick. The ticks are not in the text; each box is found again by its `key`. */
  | { type: "checklist"; items: ChecklistItem[]; indent?: number }
  /** A line across the page: the separator of a brief, the break between two groups of questions. */
  | { type: "rule" };

export interface ChecklistItem {
  key: string;
  children: InlineNode[];
}

/** A checklist line: "- [ ] words". An "[x]" someone typed reads the same; ticks are stored apart. */
const CHECKLIST_LINE = /^[-*]\s+\[[ xX]?\](?:\s+(.*))?$/;

/** Longest a box's key gets. The rest of a very long line still shows; it just is not part of the name. */
const CHECK_KEY_MAX = 200;

/**
 * What a checklist box is called, so a tick can find it again.
 *
 * Ticks are kept apart from the update (its text is its author's to change,
 * the boxes are everyone's), so each box needs a name that survives an edit.
 * Its words do: the author adding a line above it leaves it ticked, rewording
 * it clears it — it is a different thing to do now. Case, spacing and
 * formatting do not count. The second box with the same words is "words#2".
 */
export function checklistKey(text: string, seen: Map<string, number>): string {
  const base = richTextToPlain(text).replace(/\s+/g, " ").trim().toLowerCase().slice(0, CHECK_KEY_MAX) || "·";
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}#${count}`;
}

/** Every checklist box in an update, by key, in order. */
export function checklistKeys(body: string): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const match = CHECKLIST_LINE.exec(raw.trim());
    if (match) keys.push(checklistKey(match[1] ?? "", seen));
  }
  return keys;
}

/** Addresses we are willing to turn into a link. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  // Anything else — javascript:, data:, a relative path — stays plain text.
  return null;
}

/**
 * Turns what someone typed into a link dialog into an address we accept, or
 * null when it cannot be one. "example.com/brief" is understood as https.
 */
export function normalizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const direct = safeHref(trimmed);
  if (direct) return isWellFormed(direct) ? direct : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // some other scheme: ftp:, javascript:, data:
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/i.test(trimmed)) {
    const href = `https://${trimmed}`;
    return isWellFormed(href) ? href : null;
  }
  return null;
}

function isWellFormed(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "mailto:" || !!url.hostname.match(/^[^.]+(\.[^.]+)+$|^localhost$/i);
  } catch {
    return false;
  }
}

const BARE_URL = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/gi;

/**
 * A backslash before a markup character means that character, as it is. The
 * booking form escapes everything a requester types this way (composeBrief), so
 * "#RMITGrad2027" is stored as "\#RMITGrad2027" and must read as the hashtag,
 * not with the backslash, and "\*note\*" must stay asterisks rather than turn
 * italic. An escaped character is swapped for a private-use stand-in while the
 * markup is matched, so no pattern can see it, and swapped back in the result.
 */
const ESCAPED = /\\([\\*_#[\](){}`~|>-])/g;
const STAND_IN = 0xe000;
function hideEscapes(text: string): string {
  return text.includes("\\") ? text.replace(ESCAPED, (_, char: string) => String.fromCharCode(STAND_IN + char.charCodeAt(0))) : text;
}
function restoreEscapes(text: string): string {
  return text.replace(/[\ue000-\ue07f]/g, (char) => String.fromCharCode(char.charCodeAt(0) - STAND_IN));
}
function restoreInline(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return { ...node, text: restoreEscapes(node.text) };
      case "link":
        return { ...node, href: restoreEscapes(node.href), label: restoreEscapes(node.label) };
      case "mention":
        return { ...node, name: restoreEscapes(node.name) };
      default:
        return { ...node, children: restoreInline(node.children) };
    }
  });
}

/**
 * Splits one line into inline nodes. The order matters: links are taken before
 * bare addresses so the label of a link is not itself scanned for one.
 */
export function parseInline(line: string, mentionNames: readonly string[] = []): InlineNode[] {
  if (!line) return [];
  return restoreInline(parseMarkup(hideEscapes(line), mentionNames));
}

function parseMarkup(line: string, mentionNames: readonly string[]): InlineNode[] {
  if (!line) return [];

  // Longest names first, so "Danh Nguyen" wins over a colleague called "Danh".
  const names = [...mentionNames].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const patterns: Array<{ re: RegExp; build: (m: RegExpExecArray) => InlineNode | null }> = [
    {
      re: /\*\*([^*]+)\*\*/,
      build: (m) => ({ type: "bold", children: parseMarkup(m[1]!, mentionNames) }),
    },
    {
      re: /(?<!\*)\*([^*\n]+)\*(?!\*)/,
      build: (m) => ({ type: "italic", children: parseMarkup(m[1]!, mentionNames) }),
    },
    {
      // Two underscores, which this markup uses for nothing else. Standard
      // Markdown spends them on bold; here bold is ** and only **.
      re: /__([^_\n]+)__/,
      build: (m) => ({ type: "underline", children: parseMarkup(m[1]!, mentionNames) }),
    },
    {
      re: /\{c:([a-z]+)\}([\s\S]*?)\{\/c\}/,
      build: (m) => (isRichTextColor(m[1]!) ? { type: "color", color: m[1]!, children: parseMarkup(m[2]!, mentionNames) } : null),
    },
    {
      re: /\[([^\]]+)\]\(([^)\s]+)\)/,
      build: (m) => {
        const href = safeHref(m[2]!);
        return href ? { type: "link", href, label: m[1]! } : null;
      },
    },
    { re: BARE_URL, build: (m) => (safeHref(m[1]!) ? { type: "link", href: m[1]!, label: m[1]! } : null) },
    ...(names.length ? [{ re: new RegExp(`@(${names.join("|")})`), build: (m: RegExpExecArray) => ({ type: "mention", name: m[1]! }) as InlineNode }] : []),
  ];

  let earliest: { index: number; length: number; node: InlineNode } | null = null;
  for (const { re, build } of patterns) {
    const scan = new RegExp(re.source, re.flags.replace("g", ""));
    const match = scan.exec(line);
    if (!match) continue;
    const node = build(match);
    if (!node) continue;
    if (!earliest || match.index < earliest.index) earliest = { index: match.index, length: match[0].length, node };
  }

  if (!earliest) return [{ type: "text", text: line }];
  const before = line.slice(0, earliest.index);
  const after = line.slice(earliest.index + earliest.length);
  return [...(before ? [{ type: "text" as const, text: before }] : []), earliest.node, ...parseMarkup(after, mentionNames)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The indent a line asks for, and the line with that indent taken off. */
function readIndent(line: string): { indent: number; rest: string } {
  const leading = /^[ \t]*/.exec(line)?.[0] ?? "";
  if (!leading) return { indent: 0, rest: line };
  // A tab is a step; spaces are two to a step. Written by us as spaces, but
  // anybody pasting from elsewhere is likely to bring tabs.
  const steps = leading.split("").reduce((n, ch) => n + (ch === "\t" ? INDENT_SPACES : 1), 0) / INDENT_SPACES;
  return { indent: Math.min(MAX_INDENT, Math.floor(steps)), rest: line.slice(leading.length) };
}

/** The prefix a block of this indent is written with. */
export function indentPrefix(indent: number | undefined): string {
  return " ".repeat(Math.min(MAX_INDENT, Math.max(0, indent ?? 0)) * INDENT_SPACES);
}

/**
 * Text written as plain lines, read as markup without losing its line breaks.
 *
 * The markup joins lines that follow one another into one paragraph, which is
 * right for what the editor writes (it puts a blank line between paragraphs)
 * and wrong for text typed into a plain box, where a new line was a new line.
 * This puts a blank line between two plain lines in a row, so each stays its
 * own; lists, headings, rules and checklists are left as they are. Text the
 * editor wrote comes back unchanged.
 */
export function keepLineBreaks(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const plain = (line: string | undefined): boolean => {
    if (line === undefined) return false;
    const rest = readIndent(line).rest;
    if (!rest.trim()) return false;
    return !(/^-{3,}$/.test(rest.trim()) || CHECKLIST_LINE.test(rest) || /^#{1,2}\s+/.test(rest) || /^[-*]\s+/.test(rest) || /^\d+[.)]\s+/.test(rest));
  };
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index > 0 && plain(lines[index - 1]) && plain(line)) out.push("");
    out.push(line);
  });
  return out.join("\n");
}

/** Splits the whole update into blocks: headings, lists, rules and paragraphs. */
export function parseRichText(body: string, mentionNames: readonly string[] = []): BlockNode[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let paragraph: { lines: string[]; indent: number } | null = null;
  let list: { ordered: boolean; items: string[]; indent: number } | null = null;
  let checklist: { items: ChecklistItem[]; indent: number } | null = null;
  const seen = new Map<string, number>();

  const flushParagraph = () => {
    if (!paragraph) return;
    blocks.push({ type: "paragraph", children: parseInline(paragraph.lines.join(" "), mentionNames), ...(paragraph.indent ? { indent: paragraph.indent } : {}) });
    paragraph = null;
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items.map((item) => parseInline(item, mentionNames)), ...(list.indent ? { indent: list.indent } : {}) });
    list = null;
  };
  const flushChecklist = () => {
    if (!checklist) return;
    blocks.push({ type: "checklist", items: checklist.items, ...(checklist.indent ? { indent: checklist.indent } : {}) });
    checklist = null;
  };

  for (const raw of lines) {
    const { indent, rest: line } = readIndent(raw);

    // Three or more dashes on a line of their own. Checked before the bullet
    // rule, which would otherwise read "- --" out of it.
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ type: "rule" });
      continue;
    }

    // Before the bullet rule, which would read "[ ] words" as a bullet's text.
    const check = CHECKLIST_LINE.exec(line);
    if (check) {
      flushParagraph();
      flushList();
      if (checklist && checklist.indent !== indent) flushChecklist();
      checklist ??= { items: [], indent };
      const text = check[1] ?? "";
      checklist.items.push({ key: checklistKey(text, seen), children: parseInline(text, mentionNames) });
      continue;
    }
    flushChecklist();

    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1]!.length === 1 ? 1 : 2, children: parseInline(heading[2]!, mentionNames), ...(indent ? { indent } : {}) });
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      const text = (bullet?.[1] ?? numbered?.[1])!;
      // A list that changes kind, or steps in or out, is a new list.
      if (list && (list.ordered !== ordered || list.indent !== indent)) flushList();
      list ??= { ordered, items: [], indent };
      list.items.push(text);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    // Wrapped lines are one paragraph; a line that steps in or out is a new
    // one, because stepping in is the whole point of stepping in.
    if (paragraph && paragraph.indent !== indent) flushParagraph();
    if (paragraph) paragraph.lines.push(line);
    else paragraph = { lines: [line], indent };
  }
  flushParagraph();
  flushList();
  flushChecklist();
  return blocks;
}

/**
 * The words of an update with the markup taken off: a notification body, a
 * preview, a cell, or the plain copy of a brief.
 *
 * The line markers come off first, before the inline ones. A brief numbers its
 * questions inside the bold — `**4. Where will it run?**` — and taking the bold
 * off first would leave a line starting "4. ", which the numbered-list rule
 * would then read as a list item and strip the number from. Stripping lines
 * first, a line beginning with `*` is bold or italic and never a bullet, so a
 * real list still loses its markers and a numbered question keeps its number.
 */
export function richTextToPlain(body: string): string {
  return restoreEscapes(hideEscapes(body)
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/^\s*[-*]\s+\[[ xX]?\](\s+|$)/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^#{1,2}\s+/gm, "")
    .replace(/\{c:[a-z]+\}([\s\S]*?)\{\/c\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .trim());
}

/**
 * What pressing Enter should insert to continue a list.
 *
 * Returns the prefix for the next line ("- ", "3. ") when the caret is at the
 * end of a list item that has text, an empty string when the item is empty (the
 * list ends there), or null when this is not a list at all.
 */
export function continueList(currentLine: string): string | null {
  const check = /^(\s*)([-*])\s+\[[ xX]?\](?:\s+(.*))?$/.exec(currentLine);
  if (check) return check[3]?.trim() ? `${check[1]}${check[2]} [ ] ` : "";
  const bullet = /^(\s*)([-*])\s+(.*)$/.exec(currentLine);
  if (bullet) return bullet[3]!.trim() ? `${bullet[1]}${bullet[2]} ` : "";
  const numbered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(currentLine);
  if (numbered) return numbered[4]!.trim() ? `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]} ` : "";
  return null;
}

/** Wraps the selection in `before`/`after`, or offers `placeholder` when empty. */
export function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  placeholder = "",
): { value: string; selectionStart: number; selectionEnd: number } {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`;
  return {
    value: next,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  };
}

/** Puts `prefix` at the start of every line the selection touches, or takes it off again. */
export function togglePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: (index: number) => string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const endIndex = value.indexOf("\n", selectionEnd);
  const end = endIndex === -1 ? value.length : endIndex;
  const lines = value.slice(start, end).split("\n");
  const already = lines.every((line, index) => line.startsWith(prefix(index)));
  const next = lines
    .map((line, index) => (already ? line.slice(prefix(index).length) : `${prefix(index)}${line}`))
    .join("\n");
  const value2 = `${value.slice(0, start)}${next}${value.slice(end)}`;
  return { value: value2, selectionStart: start, selectionEnd: start + next.length };
}

/** The words of some inline nodes, with their formatting dropped. */
export function plainInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "link":
          return node.label;
        case "mention":
          return `@${node.name}`;
        default:
          return plainInline(node.children);
      }
    })
    .join("");
}

/**
 * A short piece of form text as plain words: a question's label in a brief, an
 * error message or an aria-label. Inline markup only — a label that starts
 * "1." keeps its number, unlike richTextToPlain, which reads a document.
 */
export function plainLabel(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => plainInline(parseInline(line)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
