/**
 * A rich-text document — a brief, or any rich-text column — as a Word file.
 *
 * Built straight from the parsed blocks the page renders, so the file has the
 * same shape as what was on screen: the booking's service and what it involves
 * at the top, headings for the questions, lists, rules and live links. The
 * package is the smallest a .docx can be — a document, its styles and its
 * relationships — which every version of Word, Pages and Google Docs opens.
 */

import JSZip from "jszip";
import { parseRichText, splitBriefFacts, type BlockNode, type InlineNode, type RichTextColor } from "@/lib/rich-text";

const COLORS: Record<RichTextColor, string> = {
  red: "C0392B",
  orange: "D35400",
  green: "1E8449",
  blue: "1F5FAD",
  purple: "7D3C98",
  grey: "7F8C8D",
};

/** One step of indent, in twentieths of a point. */
const INDENT_STEP = 360;

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  caps?: boolean;
}

function run(text: string, style: RunStyle = {}): string {
  const props = [
    style.bold ? "<w:b/>" : "",
    style.italic ? "<w:i/>" : "",
    style.caps ? "<w:caps/>" : "",
    style.color ? `<w:color w:val="${style.color}"/>` : "",
    style.size ? `<w:sz w:val="${style.size}"/>` : "",
    style.underline ? '<w:u w:val="single"/>' : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** Collects the hyperlinks as it goes: each one needs a relationship of its own. */
class Links {
  readonly targets: string[] = [];
  add(href: string): string {
    this.targets.push(href);
    return `rLink${this.targets.length}`;
  }
}

function inline(nodes: InlineNode[], links: Links, style: RunStyle = {}): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return run(node.text, style);
        case "bold":
          return inline(node.children, links, { ...style, bold: true });
        case "italic":
          return inline(node.children, links, { ...style, italic: true });
        case "underline":
          return inline(node.children, links, { ...style, underline: true });
        case "color":
          return inline(node.children, links, { ...style, color: COLORS[node.color] });
        case "mention":
          return run(`@${node.name}`, { ...style, bold: true });
        case "link":
          return `<w:hyperlink r:id="${links.add(node.href)}" w:history="1">${run(node.label, { ...style, color: "1F5FAD", underline: true })}</w:hyperlink>`;
      }
    })
    .join("");
}

function paragraph(content: string, { style, indent, hanging, border, after }: { style?: string; indent?: number; hanging?: number; border?: boolean; after?: number } = {}): string {
  const props = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D4DC"/></w:pBdr>' : "",
    after !== undefined ? `<w:spacing w:after="${after}"/>` : "",
    indent || hanging ? `<w:ind w:left="${(indent ?? 0) + (hanging ?? 0)}"${hanging ? ` w:hanging="${hanging}"` : ""}/>` : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${content}</w:p>`;
}

function block(node: BlockNode, links: Links): string {
  const indent = "indent" in node && node.indent ? node.indent * INDENT_STEP : 0;
  switch (node.type) {
    case "rule":
      return paragraph("", { border: true });
    case "heading":
      return paragraph(inline(node.children, links), { style: node.level === 1 ? "Heading1" : "Heading2", indent });
    case "paragraph":
      return paragraph(inline(node.children, links), { indent });
    case "list":
      return node.items.map((item, index) => paragraph(run(node.ordered ? `${index + 1}.\t` : "•\t") + inline(item, links), { indent, hanging: INDENT_STEP, after: 60 })).join("");
  }
}

/** The body of word/document.xml and the links it points at. Exported for the tests. */
export function richTextToDocxBody(body: string, title: string): { xml: string; links: string[] } {
  const links = new Links();
  const { facts, rest } = splitBriefFacts(parseRichText(body));
  const parts = [paragraph(run(title), { style: "Title" })];
  if (facts?.service) parts.push(paragraph(run("Service", { caps: true, color: "6B7280", size: 18 }), { after: 0 }), paragraph(run(facts.service, { bold: true, size: 36 })));
  if (facts?.involves.length) parts.push(paragraph(run("Involves", { caps: true, color: "6B7280", size: 18 }), { after: 0 }), paragraph(run(facts.involves.join("  ·  "), { bold: true, size: 26 })));
  if (facts) parts.push(paragraph("", { border: true }));
  parts.push(...rest.map((node) => block(node, links)));
  return { xml: parts.join(""), links: links.targets };
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="1F2937"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="111827"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="111827"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="111827"/></w:rPr></w:style>
</w:styles>`;

/** The whole .docx, ready to save. */
export async function richTextToDocx(body: string, title: string): Promise<Blob> {
  const { xml, links } = richTextToDocxBody(body, title);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${links
      .map((href, index) => `<Relationship Id="rLink${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`)
      .join("")}</Relationships>`,
  );
  zip.file("word/styles.xml", STYLES);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${xml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** A name a file system will take: no slashes, colons or the like. */
export function docxFileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Document"}.docx`;
}
