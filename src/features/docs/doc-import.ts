/**
 * Turning a file someone already has into a doc.
 *
 * Word (.docx), Markdown, plain text and HTML become an editable page: each is
 * turned into HTML here and then read through the editor's schema, which keeps
 * the headings, lists, quotes, code, links and emphasis and drops everything
 * else (styles, scripts, images, tables' layout). A PDF is not converted: it is
 * kept as it is and shown, read only, as the doc.
 */

/** The largest file a doc takes: big enough for a long report, small enough to keep in the database or storage. */
export const DOC_FILE_MAX_BYTES = 15 * 1024 * 1024;

export const DOC_IMPORT_ACCEPT = ".docx,.md,.markdown,.txt,.html,.htm,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,text/html";

export type DocImport = { kind: "page"; title: string; html: string } | { kind: "pdf"; title: string; file: File };

/** The file's name without its extension, for the doc's title. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Untitled";
}

/** What a file becomes, or an error saying why it cannot. */
export async function readDocFile(file: File): Promise<DocImport> {
  if (file.size > DOC_FILE_MAX_BYTES) throw new Error(`That file is ${Math.round(file.size / 1024 / 1024)} MB; a doc takes up to ${DOC_FILE_MAX_BYTES / 1024 / 1024} MB.`);
  const name = file.name.toLowerCase();
  const title = titleFromFileName(file.name);
  if (name.endsWith(".pdf") || file.type === "application/pdf") return { kind: "pdf", title, file };
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    // The browser build reads `arrayBuffer`, the Node one (tests, a server) `buffer`.
    const input = typeof Buffer === "undefined" ? { arrayBuffer } : { arrayBuffer, buffer: Buffer.from(arrayBuffer) };
    const result = await mammoth.convertToHtml(input as { arrayBuffer: ArrayBuffer });
    return { kind: "page", title, html: result.value };
  }
  if (name.endsWith(".doc")) throw new Error("Older Word files (.doc) cannot be read. Save it as .docx and upload that.");
  const text = await file.text();
  if (name.endsWith(".md") || name.endsWith(".markdown") || file.type === "text/markdown") return { kind: "page", title, html: markdownToHtml(text) };
  if (name.endsWith(".html") || name.endsWith(".htm") || file.type === "text/html") return { kind: "page", title, html: bodyOf(text) };
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return { kind: "page", title, html: textToHtml(text) };
  throw new Error("Docs take Word (.docx), Markdown, text, HTML and PDF files.");
}

/** Only the body of an HTML file: its head (and any script in it) is no part of the page. */
function bodyOf(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match ? match[1]! : html;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text as paragraphs: a blank line starts a new one, a single line break stays within it. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Bold, italic, inline code and links inside a line of Markdown, after escaping it. */
function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\s][^_]*)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^(https?:|mailto:)/i.test(href) ? `<a href="${href}">${label}</a>` : label));
}

/**
 * The Markdown people actually write, as HTML: headings, paragraphs, bulleted,
 * numbered and to-do lists (one level), quotes, fenced code and rules, with
 * bold, italic, code, strike and links inside a line. Anything else is text.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol" | "task"; items: string[] } | null = null;
  let quote: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    if (list.kind === "task") out.push(`<ul data-type="taskList">${list.items.join("")}</ul>`);
    else out.push(`<${list.kind}>${list.items.join("")}</${list.kind}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*```/.exec(line);
    if (fence) {
      flushAll();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      out.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ""));
      continue;
    }
    flushQuote();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(3, heading[1]!.length);
      out.push(`<h${level}>${inline(heading[2]!.replace(/\s+#+\s*$/, ""))}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      out.push("<hr>");
      continue;
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const kind = task ? "task" : bullet ? "ul" : numbered ? "ol" : null;
    if (kind) {
      flushParagraph();
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      if (task) list.items.push(`<li data-type="taskItem" data-checked="${task[1]!.toLowerCase() === "x"}"><p>${inline(task[2]!)}</p></li>`);
      else list.items.push(`<li><p>${inline((bullet ?? numbered)![1]!)}</p></li>`);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushAll();
  return out.join("");
}
