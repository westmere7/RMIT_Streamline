/**
 * Converts between the markup an update is stored in (see ./rich-text) and the
 * JSON document the WYSIWYG composer edits.
 *
 * Reading uses the same parser as the renderer, so the composer shows exactly
 * what a posted update will look like. Writing walks the document and emits the
 * markup again, so what is stored stays the same legible text it always was.
 */

import { isRichTextColor, parseRichText, type BlockNode, type InlineNode, type RichTextColor } from "@/lib/rich-text";

/** The shape of a ProseMirror/TipTap JSON node — only what we need. */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] };

// ---------------------------------------------------------------------------
// Markup → document

function inlineToNodes(nodes: InlineNode[], marks: NonNullable<DocNode["marks"]> = []): DocNode[] {
  const out: DocNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        if (node.text) out.push(marks.length ? { type: "text", text: node.text, marks } : { type: "text", text: node.text });
        break;
      case "bold":
        out.push(...inlineToNodes(node.children, [...marks, { type: "bold" }]));
        break;
      case "italic":
        out.push(...inlineToNodes(node.children, [...marks, { type: "italic" }]));
        break;
      case "color":
        out.push(...inlineToNodes(node.children, [...marks, { type: "textColor", attrs: { color: node.color } }]));
        break;
      case "link":
        out.push({ type: "text", text: node.label, marks: [...marks, { type: "link", attrs: { href: node.href } }] });
        break;
      case "mention":
        out.push({ type: "mention", attrs: { id: node.name, label: node.name } });
        break;
    }
  }
  return out;
}

function paragraph(nodes: InlineNode[]): DocNode {
  const content = inlineToNodes(nodes);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function blockToNode(block: BlockNode): DocNode {
  switch (block.type) {
    case "paragraph":
      return paragraph(block.children);
    case "heading": {
      const content = inlineToNodes(block.children);
      return { type: "heading", attrs: { level: block.level }, ...(content.length ? { content } : {}) };
    }
    case "list":
      return {
        type: block.ordered ? "orderedList" : "bulletList",
        ...(block.ordered ? { attrs: { start: 1 } } : {}),
        content: block.items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
      };
  }
}

/** The document the composer should show for a stored update. */
export function richTextToDoc(body: string, mentionNames: readonly string[] = []): DocNode {
  const blocks = parseRichText(body, mentionNames);
  if (blocks.length === 0) return EMPTY_DOC;
  return { type: "doc", content: blocks.map(blockToNode) };
}

// ---------------------------------------------------------------------------
// Document → markup

type MarkKind = "link" | "textColor" | "bold" | "italic";
/** Outermost first: a coloured bold link serialises as [{c:red}**text**{/c}](href). */
const MARK_ORDER: MarkKind[] = ["link", "textColor", "bold", "italic"];

function markOf(node: DocNode, kind: MarkKind) {
  return node.marks?.find((m) => m.type === kind) ?? null;
}

/** Two marks of the same kind are the same run when their attributes agree. */
function sameMark(a: ReturnType<typeof markOf>, b: ReturnType<typeof markOf>, kind: MarkKind): boolean {
  if (!a || !b) return a === b;
  if (kind === "link") return a.attrs?.href === b.attrs?.href;
  if (kind === "textColor") return a.attrs?.color === b.attrs?.color;
  return true;
}

function withoutMark(node: DocNode, kind: MarkKind): DocNode {
  return { ...node, marks: node.marks?.filter((m) => m.type !== kind) };
}

function wrapRun(kind: MarkKind, mark: NonNullable<ReturnType<typeof markOf>>, inner: string): string {
  if (!inner) return "";
  switch (kind) {
    case "link": {
      const href = String(mark.attrs?.href ?? "");
      if (!href) return inner;
      // A bare address needs no label.
      return inner === href ? href : `[${inner}](${href})`;
    }
    case "textColor": {
      const color = String(mark.attrs?.color ?? "");
      return isRichTextColor(color) ? `{c:${color}}${inner}{/c}` : inner;
    }
    case "bold":
      return `**${inner}**`;
    case "italic":
      return `*${inner}*`;
  }
}

/** Serialises inline content, splitting it into runs of each mark in turn. */
function serializeInline(nodes: DocNode[], order: MarkKind[] = MARK_ORDER): string {
  if (order.length === 0) {
    return nodes
      .map((node) => {
        if (node.type === "text") return node.text ?? "";
        if (node.type === "mention") return `@${String(node.attrs?.label ?? node.attrs?.id ?? "")}`;
        if (node.type === "hardBreak") return " ";
        return node.content ? serializeInline(node.content, MARK_ORDER) : "";
      })
      .join("");
  }
  const [kind, ...rest] = order as [MarkKind, ...MarkKind[]];
  let out = "";
  let index = 0;
  while (index < nodes.length) {
    const first = nodes[index]!;
    const mark = first.type === "text" ? markOf(first, kind) : null;
    let end = index + 1;
    while (end < nodes.length) {
      const candidate = nodes[end]!;
      const candidateMark = candidate.type === "text" ? markOf(candidate, kind) : null;
      if (!sameMark(mark, candidateMark, kind)) break;
      end++;
    }
    const run = nodes.slice(index, end);
    if (mark) {
      // Whitespace at the edges of a run goes outside the markers, so "**bold **"
      // never happens and the stored text reads cleanly.
      const inner = serializeInline(run.map((n) => withoutMark(n, kind)), rest);
      const leading = inner.match(/^\s*/)?.[0] ?? "";
      const trailing = inner.match(/\s*$/)?.[0] ?? "";
      const core = inner.slice(leading.length, inner.length - trailing.length);
      out += kind === "link" ? wrapRun(kind, mark, inner) : `${leading}${wrapRun(kind, mark, core)}${trailing}`;
    } else {
      out += serializeInline(run, rest);
    }
    index = end;
  }
  return out;
}

function listItemText(item: DocNode): string {
  // An item holds one paragraph; anything nested is flattened onto the line.
  return (item.content ?? []).map((child) => serializeInline(child.content ?? [])).join(" ").trim();
}

/** The markup to store for what the composer shows. */
export function docToRichText(doc: DocNode): string {
  const lines: string[] = [];
  let previous: string | null = null;
  for (const block of doc.content ?? []) {
    let text: string;
    switch (block.type) {
      case "heading": {
        const level = Number(block.attrs?.level) === 1 ? 1 : 2;
        text = `${"#".repeat(level)} ${serializeInline(block.content ?? []).trim()}`;
        break;
      }
      case "bulletList":
        text = (block.content ?? []).map((item) => `- ${listItemText(item)}`).join("\n");
        break;
      case "orderedList": {
        const start = Number(block.attrs?.start) || 1;
        text = (block.content ?? []).map((item, i) => `${start + i}. ${listItemText(item)}`).join("\n");
        break;
      }
      default:
        text = serializeInline(block.content ?? []);
    }
    // Two paragraphs in a row need a blank line between them, or the parser
    // would run them together into one; other blocks start their own line.
    if (previous === "paragraph" && block.type === "paragraph") lines.push("");
    lines.push(text);
    previous = block.type;
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type { RichTextColor };
