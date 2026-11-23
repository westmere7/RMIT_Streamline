import type { jsPDF as JsPdf } from "jspdf";
import type { BookingFormTemplate, BookingReceipt, BookingRequest } from "@/domain";
import { formatAssetLine, serviceById } from "@/domain";
import { loadPng, pdfSafe } from "@/features/dashboard/export-pdf";
import { parseRichText, plainInline, plainLabel, type BlockNode, type InlineNode } from "@/lib/rich-text";
import { composeBrief } from "@/services/booking";

/**
 * A booking as a PDF, for the person who made it: the ticket, what was asked
 * for, the brief as the team will read it, and the deliverables, on A4 pages.
 *
 * Drawn as text, not a picture of the screen, so it can be searched and
 * copied. The PDF format's own fonts cannot write Vietnamese, and a booking
 * is full of people's names and their own words, so the text is set in Geist
 * (public/fonts, SIL Open Font License), which can; it has no bold, so bold is
 * drawn by outlining the letters. If the font cannot be loaded, the built-in
 * font is used and letters it lacks lose their accents rather than vanish.
 *
 * The page is headed by the RMIT logo (public/brand/rmit-logo.svg) and the
 * app's (public/logo-light.svg), drawn into PNGs in the browser; either is
 * simply left out when it cannot be loaded.
 */

/** A PNG as a data URL, and its height over its width. */
export interface PdfImage {
  data: string;
  ratio: number;
}

/** What the document needs from outside: the font's bytes and the two logos. Either may come back empty. */
export interface BookingPdfAssets {
  font: () => Promise<Uint8Array | null>;
  logos?: () => Promise<{ rmit: PdfImage | null; app: PdfImage | null }>;
}

export interface BookingPdfInput {
  receipt: BookingReceipt;
  request: BookingRequest;
  template: BookingFormTemplate;
  workspaceName: string;
}

const RED = "#e61e2a";
const NAVY = "#000054";
const INK = "#262630";
const MUTED = "#686c7a";
const RULE = "#dee0e8";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const BOTTOM = PAGE_H - 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PT = 0.3528; // mm per point

interface Run {
  text: string;
  bold?: boolean;
  href?: string;
}

export async function downloadBookingPdf(input: BookingPdfInput): Promise<void> {
  const doc = await buildBookingPdf(input, {
    font: fetchFont,
    logos: async () => {
      const [rmit, app] = await Promise.all([loadPng("/brand/rmit-logo.svg", 700), loadPng("/logo-light.svg", 900)]);
      return { rmit, app };
    },
  });
  doc.save(fileName(input.receipt));
}

/** The document, drawn. A font that cannot be had falls back to the built-in one; a missing logo is left out. */
export async function buildBookingPdf(input: BookingPdfInput, assets: BookingPdfAssets): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const [bytes, logos] = await Promise.all([assets.font().catch(() => null), assets.logos ? assets.logos().catch(() => null) : null]);
  const unicode = registerFont(doc, bytes);
  new BookingPdf(doc, unicode, logos?.rmit ?? null, logos?.app ?? null).draw(input);
  return doc;
}

/** CP_014-open-day-posters.pdf */
export function fileName(receipt: Pick<BookingReceipt, "ticket" | "itemName">): string {
  const slug = receipt.itemName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${receipt.ticket || "booking"}${slug ? `-${slug}` : ""}.pdf`;
}

async function fetchFont(): Promise<Uint8Array | null> {
  const response = await fetch("/fonts/Geist-Regular.ttf");
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

function registerFont(doc: JsPdf, bytes: Uint8Array | null): boolean {
  if (!bytes) return false;
  try {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    doc.addFileToVFS("Geist-Regular.ttf", btoa(binary));
    doc.addFont("Geist-Regular.ttf", "Geist", "normal");
    return true;
  } catch {
    return false;
  }
}

/** The leading "Service:" and "Work types:" lines of a brief, and the rule under them: the facts table has them. */
function dropBriefFacts(blocks: BlockNode[]): BlockNode[] {
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block?.type !== "paragraph" || block.children[0]?.type !== "bold") break;
    const label = plainInline(block.children[0].children).trim();
    if (label !== "Service:" && label !== "Work types:") break;
    index++;
  }
  if (index > 0 && blocks[index]?.type === "rule") index++;
  return blocks.slice(index);
}

function runsOf(nodes: InlineNode[], bold = false): Run[] {
  const runs: Run[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push({ text: node.text, bold });
        break;
      case "bold":
        runs.push(...runsOf(node.children, true));
        break;
      case "italic":
      case "underline":
      case "color":
        runs.push(...runsOf(node.children, bold));
        break;
      case "link":
        runs.push({ text: node.label || node.href, href: node.href, bold });
        break;
      case "mention":
        runs.push({ text: `@${node.name}`, bold: true });
        break;
    }
  }
  return runs;
}

class BookingPdf {
  private y = MARGIN;

  constructor(
    private readonly doc: JsPdf,
    private readonly unicode: boolean,
    private readonly rmitLogo: PdfImage | null = null,
    private readonly appLogo: PdfImage | null = null,
  ) {}

  draw({ receipt, request, template, workspaceName }: BookingPdfInput) {
    const service = serviceById(template, request.serviceTypeId);

    // Header: the RMIT logo and the app's, whose form it was, the ticket to quote, and the task.
    const logoTop = this.y - 4;
    let logoBottom = this.y;
    if (this.rmitLogo) {
      const w = 30;
      const h = w * this.rmitLogo.ratio;
      this.doc.addImage(this.rmitLogo.data, "PNG", MARGIN, logoTop, w, h);
      logoBottom = Math.max(logoBottom, logoTop + h);
    }
    if (this.appLogo) {
      const w = 28;
      const h = w * this.appLogo.ratio;
      // Level with the middle of the RMIT logo, or the top line when there is none.
      const top = this.rmitLogo ? logoTop + (30 * this.rmitLogo.ratio - h) / 2 : logoTop;
      this.doc.addImage(this.appLogo.data, "PNG", PAGE_W - MARGIN - w, top, w, h);
      logoBottom = Math.max(logoBottom, top + h);
    }
    if (this.rmitLogo || this.appLogo) this.y = logoBottom + 5;
    this.text(workspaceName, MARGIN, this.y + 3, 9, MUTED);
    this.text("Booking", PAGE_W - MARGIN, this.y + 3, 9, MUTED, { align: "right" });
    this.y += 12;
    this.text(receipt.ticket, MARGIN, this.y, 22, RED, { bold: true });
    this.y += 8;
    this.paragraph([{ text: request.title || receipt.itemName, bold: true }], { size: 15, colour: NAVY, lineGap: 1.3 });
    this.y += 3;
    this.rule();

    // The facts, as the recap step listed them.
    const facts: Array<[string, Run[]]> = [];
    const plain = (text: string): Run[] => [{ text }];
    facts.push(["From", plain(request.requesterName || "—")]);
    if (request.requesterEmail) facts.push(["Email", plain(request.requesterEmail)]);
    if (request.department?.trim()) facts.push(["Department", plain(request.department.trim())]);
    if (service) facts.push(["Service", plain(service.name)]);
    if (request.subServices.length) facts.push([plainLabel(service?.subServiceLabel ?? "") || "Work types", plain(request.subServices.join(", "))]);
    if (request.priority) facts.push(["Urgency", plain(request.priority)]);
    if (request.dueDate) facts.push(["Needed by", plain(formatDay(request.dueDate))]);
    facts.push(["Going to", plain(receipt.teamName ? `${receipt.teamName} (${receipt.boardName})` : "The allocation queue")]);
    facts.push(["Booked", plain(formatWhen(receipt.submittedAt))]);
    if (request.referenceUrl) facts.push(["Reference", [{ text: request.referenceUrl, href: request.referenceUrl }]]);
    this.y += 2;
    for (const [label, value] of facts) {
      this.ensure(6);
      const top = this.y;
      this.text(label, MARGIN, top + 3.4, 9.5, MUTED);
      this.paragraph(value, { x: MARGIN + 32, width: CONTENT_W - 32, size: 10 });
      this.y = Math.max(this.y, top + 6);
    }

    // The brief, as the team will read it.
    const blocks = dropBriefFacts(parseRichText(composeBrief(request, template)));
    if (blocks.length) {
      this.section("Brief");
      for (const block of blocks) this.block(block);
    }

    // The deliverables, one line each.
    if (request.assets.length) {
      this.section(request.assets.length === 1 ? "1 asset" : `${request.assets.length} assets`);
      request.assets.forEach((line, i) => this.listItem(`${i + 1}.`, [{ text: formatAssetLine(line) }], 0));
    }

    this.footers(workspaceName, receipt);
  }

  // ---- blocks -------------------------------------------------------------

  private block(block: BlockNode) {
    const indent = "indent" in block ? (block.indent ?? 0) * 5 : 0;
    switch (block.type) {
      case "heading":
        this.y += block.level === 1 ? 3 : 2;
        this.ensure(10);
        this.paragraph(runsOf(block.children, true), { x: MARGIN + indent, width: CONTENT_W - indent, size: block.level === 1 ? 12.5 : 10.5, colour: block.level === 1 ? NAVY : INK });
        this.y += 0.8;
        break;
      case "paragraph":
        this.paragraph(runsOf(block.children), { x: MARGIN + indent, width: CONTENT_W - indent, size: 10 });
        this.y += 1.2;
        break;
      case "list":
        block.items.forEach((item, i) => this.listItem(block.ordered ? `${i + 1}.` : "•", runsOf(item), indent));
        this.y += 1;
        break;
      case "checklist":
        for (const item of block.items) this.listItem("box", runsOf(item.children), indent);
        this.y += 1;
        break;
      case "rule":
        this.y += 1.5;
        this.rule();
        break;
    }
  }

  private listItem(marker: string, runs: Run[], indent: number) {
    const size = 10;
    this.ensure(lineHeight(size));
    const x = MARGIN + indent;
    const baseline = this.y + size * PT * 0.95;
    if (marker === "box") {
      this.doc.setDrawColor(MUTED);
      this.doc.setLineWidth(0.25);
      this.doc.rect(x + 0.6, baseline - 2.6, 2.8, 2.8);
    } else {
      this.text(marker, x, baseline, size, MUTED);
    }
    this.paragraph(runs, { x: x + 6, width: CONTENT_W - indent - 6, size });
    this.y += 0.6;
  }

  private section(title: string) {
    this.y += 5;
    this.ensure(14);
    this.text(title, MARGIN, this.y + 4, 11, RED, { bold: true });
    this.y += 6.5;
  }

  private rule() {
    this.doc.setDrawColor(RULE);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 3;
  }

  // ---- text ---------------------------------------------------------------

  /** Runs laid out word by word across `width`, wrapping onto new lines and pages. */
  private paragraph(runs: Run[], options: { x?: number; width?: number; size?: number; colour?: string; lineGap?: number } = {}) {
    const x0 = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_W;
    const size = options.size ?? 10;
    const colour = options.colour ?? INK;
    const height = lineHeight(size) * (options.lineGap ?? 1);
    this.setFont(size);

    // Words with the spaces after them, each keeping its run's style; a line break in the text ends the line.
    const tokens: Array<Run & { width: number; newline?: boolean }> = [];
    for (const run of runs) {
      const text = this.safe(run.text);
      for (const piece of text.split(/(\n)/)) {
        if (piece === "\n") {
          tokens.push({ text: "", width: 0, newline: true });
          continue;
        }
        for (const word of piece.split(/(?<=\s)/)) if (word) tokens.push({ ...run, text: word, width: this.doc.getTextWidth(word) });
      }
    }

    const lines: Array<typeof tokens> = [[]];
    let used = 0;
    for (const token of tokens) {
      const line = lines[lines.length - 1]!;
      if (token.newline) {
        lines.push([]);
        used = 0;
        continue;
      }
      if (used + token.width > width && line.length && token.text.trim()) {
        lines.push([]);
        used = 0;
      }
      const current = lines[lines.length - 1]!;
      if (!current.length && !token.text.trim()) continue;
      // A single word wider than the line is cut to fit rather than run off the page.
      if (token.width > width) {
        let piece = "";
        for (const ch of token.text) {
          if (this.doc.getTextWidth(piece + ch) > width && piece) {
            current.push({ ...token, text: piece, width: this.doc.getTextWidth(piece) });
            lines.push([]);
            piece = "";
          }
          piece += ch;
        }
        lines[lines.length - 1]!.push({ ...token, text: piece, width: this.doc.getTextWidth(piece) });
        used = this.doc.getTextWidth(piece);
        continue;
      }
      current.push(token);
      used += token.width;
    }

    for (const line of lines) {
      this.ensure(height);
      const baseline = this.y + size * PT * 0.95;
      let x = x0;
      for (const token of line) {
        const tint = token.href ? NAVY : colour;
        this.put(token.text, x, baseline, size, tint, token.bold ?? false);
        if (token.href) {
          const w = this.doc.getTextWidth(token.text.trimEnd());
          this.doc.setDrawColor(tint);
          this.doc.setLineWidth(0.15);
          this.doc.line(x, baseline + 0.6, x + w, baseline + 0.6);
          this.doc.link(x, baseline - size * PT, w, size * PT * 1.2, { url: token.href });
        }
        x += token.width;
      }
      this.y += height;
    }
  }

  private text(value: string, x: number, y: number, size: number, colour: string, options: { bold?: boolean; align?: "left" | "right" } = {}) {
    this.setFont(size);
    const text = this.safe(value);
    const at = options.align === "right" ? x - this.doc.getTextWidth(text) : x;
    this.put(text, at, y, size, colour, options.bold ?? false);
  }

  /** One piece of text; bold is the letters outlined in their own colour, as the font has no bold. */
  private put(text: string, x: number, y: number, size: number, colour: string, bold: boolean) {
    this.setFont(size);
    this.doc.setTextColor(colour);
    if (bold) {
      this.doc.setDrawColor(colour);
      this.doc.setLineWidth(size * 0.012);
      this.doc.text(text, x, y, { renderingMode: "fillThenStroke" });
    } else {
      this.doc.text(text, x, y);
    }
  }

  private setFont(size: number) {
    this.doc.setFont(this.unicode ? "Geist" : "helvetica", "normal");
    this.doc.setFontSize(size);
  }

  private safe(text: string): string {
    return this.unicode ? text : pdfSafe(text);
  }

  private ensure(height: number) {
    if (this.y + height <= BOTTOM) return;
    this.doc.addPage();
    this.y = MARGIN;
  }

  private footers(workspaceName: string, receipt: BookingReceipt) {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      this.doc.setPage(page);
      this.doc.setDrawColor(RULE);
      this.doc.setLineWidth(0.3);
      this.doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
      this.text(`${receipt.ticket} · Booked with ${workspaceName}`, MARGIN, PAGE_H - 9.5, 8, MUTED);
      this.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 9.5, 8, MUTED, { align: "right" });
    }
  }
}

function lineHeight(size: number): number {
  return size * PT * 1.45;
}

/** "Wed 2 Dec 2026" */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(y!, (m ?? 1) - 1, d ?? 1));
}

/** "20 Nov 2026, 2:15 pm", in the reader's own time. */
function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
