/**
 * The small markup an update is written in.
 *
 * It is a subset of Markdown, chosen so that an update written before any of
 * this existed still reads exactly as it did, and so that what is stored stays
 * legible in the database and in a search result:
 *
 *   **bold**            *italic*
 *   # Heading           ## Subheading
 *   - bullet            1. numbered
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
  | { type: "color"; color: RichTextColor; children: InlineNode[] }
  | { type: "link"; href: string; label: string }
  | { type: "mention"; name: string };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: 1 | 2; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] };

/** Addresses we are willing to turn into a link. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  // Anything else — javascript:, data:, a relative path — stays plain text.
  return null;
}

const BARE_URL = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/gi;

/**
 * Splits one line into inline nodes. The order matters: links are taken before
 * bare addresses so the label of a link is not itself scanned for one.
 */
export function parseInline(line: string, mentionNames: readonly string[] = []): InlineNode[] {
  if (!line) return [];

  // Longest names first, so "Danh Nguyen" wins over a colleague called "Danh".
  const names = [...mentionNames].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const patterns: Array<{ re: RegExp; build: (m: RegExpExecArray) => InlineNode | null }> = [
    {
      re: /\*\*([^*]+)\*\*/,
      build: (m) => ({ type: "bold", children: parseInline(m[1]!, mentionNames) }),
    },
    {
      re: /(?<!\*)\*([^*\n]+)\*(?!\*)/,
      build: (m) => ({ type: "italic", children: parseInline(m[1]!, mentionNames) }),
    },
    {
      re: /\{c:([a-z]+)\}([\s\S]*?)\{\/c\}/,
      build: (m) => (isRichTextColor(m[1]!) ? { type: "color", color: m[1]!, children: parseInline(m[2]!, mentionNames) } : null),
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
  return [...(before ? [{ type: "text" as const, text: before }] : []), earliest.node, ...parseInline(after, mentionNames)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits the whole update into blocks: headings, lists and paragraphs. */
export function parseRichText(body: string, mentionNames: readonly string[] = []): BlockNode[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" "), mentionNames) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items.map((item) => parseInline(item, mentionNames)) });
    list = null;
  };

  for (const line of lines) {
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1]!.length === 1 ? 1 : 2, children: parseInline(heading[2]!, mentionNames) });
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      const text = (bullet?.[1] ?? numbered?.[1])!;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(text);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The first line of an update, for a notification body or a preview. */
export function richTextToPlain(body: string): string {
  return body
    .replace(/\{c:[a-z]+\}([\s\S]*?)\{\/c\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/^#{1,2}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .trim();
}

/**
 * What pressing Enter should insert to continue a list.
 *
 * Returns the prefix for the next line ("- ", "3. ") when the caret is at the
 * end of a list item that has text, an empty string when the item is empty (the
 * list ends there), or null when this is not a list at all.
 */
export function continueList(currentLine: string): string | null {
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
