import type { jsPDF as JsPdf } from "jspdf";
import { formatHours, hasAnyRate } from "@/domain";
import { assetEffortMix, assetMix, priorityMix, teamHex, type NamedCount } from "@/features/dashboard/analytics";
import { formatCount, niceScale } from "@/features/dashboard/charts/chart-utils";
import { treemapLayout } from "@/features/dashboard/charts/treemap";
import { formatDays, formatPercent, inAndOut, onTime, sentBack, turnaround, type FlowBucket, type RateFigure } from "@/features/dashboard/flow";
import { DASHBOARD_HELP, type HelpTopic } from "@/features/dashboard/help";
import {
  assignedWorkload,
  departmentHex,
  MEASURE_LABELS,
  MEASURE_UNITS,
  operationsDetails,
  workloadDepartments,
  workloadForDepartment,
  type Comparison,
  type MonthlyComparisonRow,
  type WorkloadRow,
} from "@/features/dashboard/metrics";
import type { DashboardViewProps } from "@/features/dashboard/views/types";
import { workTypeContributors, workTypeProfile, type WorkTypeProfile } from "@/features/dashboard/work-types";
import { colorClasses } from "@/lib/colors";

/**
 * The dashboard as a PDF: every panel drawn again as real vector shapes and
 * text — not a picture of the screen — with its explanation beside it (what it
 * shows, how it's counted, how to read it, what to do), on A4 landscape pages
 * in the RMIT colours, with the period, the filters and when it was made on the
 * cover and in every footer.
 *
 * Drawn from the same figures the page is drawn from (the view props and the
 * same analytics calls), so the report and the screen cannot disagree, and it
 * reads the same whatever theme the reader has on. Charts stay sharp at any
 * zoom, and every word can be selected and searched.
 *
 * The official RMIT logo is not in the repository. Put it at
 * public/brand/rmit-logo.png and it appears on the cover.
 */

export interface ExportMeta {
  workspaceName: string;
  workspaceSlug: string;
  periodLabel: string;
  comparisonLabel: string;
  measureLabel: string;
  basisLabel: string;
  teamsLabel: string;
  generatedBy: string | null;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Page and brand

const RED = "#e61e2a";
const NAVY = "#000054";
const INK = "#262630";
const MUTED = "#686c7a";
const FAINT = "#9a9eac";
const RULE = "#dee0e8";
const TRACK = "#eef0f5";
const SURFACE = "#f5f6fa";
const GREEN = "#10b981";
const AMBER = "#f59e0b";
const SKY = "#0ea5e9";
const SLATE = "#94a3b8";

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 20;
const BOTTOM = PAGE_H - 14;
const PT = 0.3528; // mm per point
const HEAD_H = 10;
const GAP = 9;
const TEXT_SIZE = 8.2;
/** The chart's share of a block's width; the explanation takes the rest. */
const CHART_SHARE = 0.52;

const SECTIONS: Array<{ key: "shows" | "counted" | "read" | "act"; label: string }> = [
  { key: "shows", label: "What it shows" },
  { key: "counted", label: "How it's counted" },
  { key: "read", label: "How to read it" },
  { key: "act", label: "What to do" },
];

/**
 * The PDF's built-in font covers Western European text only: arrows and a true
 * minus become their plain equivalents, and letters it has no glyph for (a
 * Vietnamese name, say) lose their accents rather than printing as gaps.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/[−–]/g, "-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[^\u0000-ÿ‘’“”…•€]/g, (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\u0000-ÿ]/g, ""));
}

/** "Sunday 27 September 2026 at 6:42 pm (Asia/Saigon)". */
export function reportTimestamp(now: Date, timezone: string): string {
  const when = new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(now);
  return `${when} (${timezone})`;
}

/** dashboard-rmit-2026-09-27-1842.pdf, in the reporting timezone. */
export function reportFileName(slug: string, now: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `dashboard-${slug}-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.pdf`;
}

/** A colour mixed towards white: 0 is the colour, 1 is white. For the pale bars a PDF has no opacity for. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix) as [number, number, number];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** An image from the site as a PNG, or null when it is not there. */
async function loadPng(src: string, width: number): Promise<{ data: string; ratio: number } | null> {
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    const ratio = image.naturalHeight / image.naturalWidth || 0.2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), ratio };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drawing

type Weight = "normal" | "bold";

/** The pen the charts draw with: jsPDF's calls, in millimetres, with the text helpers the report needs. */
class Pen {
  constructor(readonly doc: JsPdf) {}

  font(size: number, weight: Weight = "normal", colour = INK) {
    this.doc.setFont("helvetica", weight);
    this.doc.setFontSize(size);
    this.doc.setTextColor(colour);
  }

  lineHeight(size: number) {
    return size * PT * 1.38;
  }

  wrap(text: string, width: number, size: number, weight: Weight = "normal"): string[] {
    this.doc.setFont("helvetica", weight);
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(pdfSafe(text), width) as string[];
  }

  /** Wrapped text from the top of its first line; returns where it ended. */
  write(text: string, x: number, y: number, width: number, size: number, weight: Weight = "normal", colour = INK): number {
    const lines = this.wrap(text, width, size, weight);
    this.font(size, weight, colour);
    this.doc.text(lines, x, y, { baseline: "top", lineHeightFactor: 1.38 });
    return y + lines.length * this.lineHeight(size);
  }

  /** One line, cut with an ellipsis to fit. */
  text(text: string, x: number, y: number, size: number, options: { weight?: Weight; colour?: string; align?: "left" | "right" | "center"; max?: number; baseline?: "top" | "middle" | "bottom" } = {}) {
    this.font(size, options.weight ?? "normal", options.colour ?? INK);
    const whole = pdfSafe(text);
    let line = whole;
    if (options.max) {
      while (line.length > 1 && this.doc.getTextWidth(`${line}…`) > options.max) line = line.slice(0, -1);
      if (line !== whole && this.doc.getTextWidth(whole) > options.max) line = `${line.trimEnd()}…`;
      else line = whole;
    }
    this.doc.text(line, x, y, { baseline: options.baseline ?? "top", align: options.align ?? "left" });
  }

  width(text: string, size: number, weight: Weight = "normal") {
    this.doc.setFont("helvetica", weight);
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(pdfSafe(text));
  }

  fill(x: number, y: number, w: number, h: number, colour: string, radius = 0) {
    if (w <= 0.01 || h <= 0.01) return;
    this.doc.setFillColor(colour);
    const r = Math.min(radius, w / 2, h / 2);
    if (r > 0) this.doc.roundedRect(x, y, w, h, r, r, "F");
    else this.doc.rect(x, y, w, h, "F");
  }

  line(x1: number, y1: number, x2: number, y2: number, colour = RULE, width = 0.2, dash?: number[]) {
    this.doc.setDrawColor(colour);
    this.doc.setLineWidth(width);
    if (dash) this.doc.setLineDashPattern(dash, 0);
    this.doc.line(x1, y1, x2, y2);
    if (dash) this.doc.setLineDashPattern([], 0);
  }

  dot(x: number, y: number, r: number, colour: string) {
    this.doc.setFillColor(colour);
    this.doc.circle(x, y, r, "F");
  }

  /** Small capitals with a little air between the letters, for labels. */
  caps(text: string, x: number, y: number, size: number, colour: string) {
    this.font(size, "bold", colour);
    this.doc.text(pdfSafe(text.toUpperCase()), x, y, { baseline: "top", charSpace: 0.35 });
  }

  /** A small coloured square and its label; returns the x after it. */
  key(x: number, y: number, colour: string, label: string): number {
    this.fill(x, y + 0.6, 2.2, 2.2, colour, 0.5);
    this.text(label, x + 3.4, y, 7.2, { colour: MUTED });
    return x + 3.4 + this.width(label, 7.2) + 5;
  }
}

/** A chart drawn into a box; `height(width)` says how tall it wants to be at that width. */
interface Figure {
  height: (width: number) => number;
  draw: (pen: Pen, x: number, y: number, w: number, h: number) => void;
}

/** Horizontal bars, one per row, with its figure at the end. */
function rankedBars(rows: NamedCount[], format: (v: number) => string, options: { max?: number; label?: number; empty?: string } = {}): Figure {
  const rowH = 6.4;
  return {
    height: () => (rows.length ? rows.length * rowH : 10),
    draw: (pen, x, y, w) => {
      if (!rows.length) return pen.text(options.empty ?? "Nothing to show in this period.", x, y + 2, 8, { colour: MUTED });
      const labelW = options.label ?? Math.min(44, w * 0.34);
      const valueW = 16;
      const trackW = w - labelW - valueW - 3;
      const max = options.max ?? Math.max(1, ...rows.map((r) => r.value));
      rows.forEach((row, i) => {
        const ry = y + i * rowH;
        pen.text(row.name, x, ry + 0.6, 8, { max: labelW - 2 });
        pen.fill(x + labelW, ry + 1.2, trackW, 2.6, TRACK, 1.3);
        pen.fill(x + labelW, ry + 1.2, Math.max(row.value > 0 ? 1 : 0, Math.min(1, row.value / max) * trackW), 2.6, row.color, 1.3);
        pen.text(format(row.value), x + w, ry + 0.6, 8, { weight: "bold", align: "right" });
      });
    },
  };
}

/** A headline figure, what it was a year ago, and the months behind it as a line. */
function headline(comparison: Comparison, unit: string, format: (v: number) => string, trend: MonthlyComparisonRow[], comparisonLabel: string): Figure {
  return {
    height: () => 42,
    draw: (pen, x, y, w) => {
      const figure = format(comparison.current);
      pen.text(figure, x, y, 30, { weight: "bold", colour: NAVY });
      pen.text(unit, x + pen.width(figure, 30, "bold") + 2.5, y + 5.6, 10, { colour: MUTED });
      if (comparison.comparison !== null && comparison.delta !== null) {
        const up = comparison.delta > 0;
        const change = `${up ? "+" : comparison.delta < 0 ? "-" : ""}${format(Math.abs(comparison.delta))}${comparison.percent === null ? "" : ` (${comparison.percent > 0 ? "+" : ""}${comparison.percent.toFixed(Math.abs(comparison.percent) < 10 ? 1 : 0)}%)`}`;
        pen.text(change, x, y + 13.5, 9, { weight: "bold", colour: up ? GREEN : comparison.delta < 0 ? RED : MUTED });
        pen.text(`against ${format(comparison.comparison)} in ${comparisonLabel}`, x + pen.width(change, 9, "bold") + 2.5, y + 13.5, 9, { colour: MUTED });
      }
      // The months so far, as a line with a dot on the last one.
      const known = trend.map((row, i) => [i, row.current] as const).filter((entry): entry is readonly [number, number] => entry[1] !== null);
      const top = y + 21;
      const h = 13;
      const peak = Math.max(1, ...known.map(([, v]) => v));
      const step = w / Math.max(1, trend.length - 1);
      pen.line(x, top + h, x + w, top + h, RULE, 0.2);
      for (let i = 1; i < known.length; i++) {
        const [a, va] = known[i - 1]!;
        const [b, vb] = known[i]!;
        pen.line(x + a * step, top + h - (va / peak) * h, x + b * step, top + h - (vb / peak) * h, RED, 0.5);
      }
      const last = known.at(-1);
      if (last) pen.dot(x + last[0] * step, top + h - (last[1] / peak) * h, 0.8, RED);
      trend.forEach((row, i) => pen.text(row.label.slice(0, 3), x + i * step, top + h + 1.5, 6.2, { colour: FAINT, align: i === 0 ? "left" : i === trend.length - 1 ? "right" : "center" }));
    },
  };
}

/** A column chart's frame: dashed gridlines and their figures down the left. Returns where a value sits. */
function axis(pen: Pen, x: number, w: number, plotTop: number, plotBottom: number, peak: number, format: (v: number) => string) {
  const { top, ticks } = niceScale(peak, 4);
  const left = x + Math.max(8, pen.width(format(top), 6.4) + 3);
  const yOf = (v: number) => plotBottom - (Math.max(0, v) / top) * (plotBottom - plotTop);
  for (const tick of ticks) {
    pen.line(left, yOf(tick), x + w, yOf(tick), tick === 0 ? "#c9ccd6" : RULE, 0.2, tick === 0 ? undefined : [0.6, 1]);
    pen.text(format(tick), left - 1.5, yOf(tick), 6.4, { colour: FAINT, align: "right", baseline: "middle" });
  }
  return { left, yOf };
}

/** Paired columns a month: this year beside last, and the rest of last year pale. */
function monthColumns(rows: MonthlyComparisonRow[], format: (v: number) => string, currentLabel: string, comparisonLabel: string): Figure {
  return {
    height: () => 84,
    draw: (pen, x, y, w, h) => {
      let kx = pen.key(x, y, RED, currentLabel);
      kx = pen.key(kx, y, SLATE, comparisonLabel);
      pen.key(kx, y, tint(SLATE, 0.55), "Rest of last year");
      const peak = Math.max(1, ...rows.map((r) => Math.max(r.current ?? 0, r.comparison ?? 0, r.outlook ?? 0)));
      const plotBottom = y + h - 6;
      const { left, yOf } = axis(pen, x, w, y + 9, plotBottom, peak, format);
      const slot = (x + w - left) / rows.length;
      const bar = Math.min(6, slot / 2.8);
      rows.forEach((row, i) => {
        const centre = left + i * slot + slot / 2;
        const pale = row.comparison === null && row.outlook !== null;
        const before = pale ? row.outlook! : (row.comparison ?? 0);
        if (row.comparison !== null || pale) pen.fill(centre - bar - 0.4, yOf(before), bar, plotBottom - yOf(before), pale ? tint(SLATE, 0.55) : SLATE, 0.6);
        if (row.current !== null) {
          pen.fill(centre + 0.4, yOf(row.current), bar, plotBottom - yOf(row.current), RED, 0.6);
          if (row.current > 0) pen.text(format(row.current), centre + 0.4 + bar / 2, yOf(row.current) - 0.8, 6, { weight: "bold", align: "center", baseline: "bottom" });
        }
        pen.text(row.label.slice(0, 3), centre, plotBottom + 1.5, 6.8, { colour: row.current === null ? FAINT : MUTED, align: "center" });
      });
    },
  };
}

/** Right now: four tiles, each with how bad and where. */
function operationsTiles(items: Array<{ label: string; count: number; urgent?: boolean; details: string[] }>): Figure {
  return {
    height: () => 66,
    draw: (pen, x, y, w, h) => {
      const gap = 4;
      const tileW = (w - gap) / 2;
      const tileH = (h - gap) / 2;
      const peak = Math.max(1, ...items.map((i) => i.count));
      items.forEach((item, i) => {
        const tx = x + (i % 2) * (tileW + gap);
        const ty = y + Math.floor(i / 2) * (tileH + gap);
        pen.fill(tx, ty, tileW, tileH, SURFACE, 2);
        pen.text(formatCount(item.count), tx + 4, ty + 3.2, 20, { weight: "bold", colour: item.urgent && item.count > 0 ? RED : NAVY });
        pen.text(item.label, tx + 4, ty + 12.4, 8, { weight: "bold" });
        item.details.forEach((line, j) => pen.text(line, tx + 4, ty + 16.8 + j * 3.4, 7, { colour: MUTED, max: tileW - 8 }));
        pen.fill(tx + 4, ty + tileH - 4, tileW - 8, 1.2, "#e3e5ec", 0.6);
        pen.fill(tx + 4, ty + tileH - 4, Math.max(item.count > 0 ? 1 : 0, (item.count / peak) * (tileW - 8)), 1.2, item.urgent ? RED : "#7c8194", 0.6);
      });
    },
  };
}

/** The asset types as a map of blocks, with the list beside it. */
function assetMap(rows: NamedCount[], format: (v: number) => string): Figure {
  return {
    height: () => 80,
    draw: (pen, x, y, w, h) => {
      if (!rows.length) return pen.text("No deliverables in this period.", x, y + 2, 8, { colour: MUTED });
      const listW = Math.min(78, w * 0.34);
      const mapW = w - listW - 7;
      const tiles = treemapLayout(rows.map((r) => ({ key: r.name, value: r.value })), mapW / h);
      const byKey = new Map(rows.map((r) => [r.name, r]));
      for (const tile of tiles) {
        const row = byKey.get(tile.key);
        if (!row) continue;
        const tx = x + (tile.x / 100) * mapW;
        const ty = y + (tile.y / 100) * h;
        const tw = (tile.w / 100) * mapW;
        const th = (tile.h / 100) * h;
        pen.fill(tx + 0.3, ty + 0.3, tw - 0.6, th - 0.6, row.color, 0.8);
        if (tw > 16 && th > 9) {
          pen.text(row.name, tx + 1.8, ty + 1.6, 7, { weight: "bold", colour: "#ffffff", max: tw - 3.6 });
          pen.text(format(row.value), tx + 1.8, ty + 4.9, 6.6, { colour: "#ffffff" });
        }
      }
      const total = rows.reduce((sum, r) => sum + r.value, 0) || 1;
      const lx = x + mapW + 7;
      const perRow = 4.6;
      const fits = Math.floor(h / perRow);
      const shown = rows.length > fits ? rows.slice(0, fits - 1) : rows;
      shown.forEach((row, i) => {
        const ly = y + i * perRow;
        pen.dot(lx + 1, ly + 1.4, 0.9, row.color);
        pen.text(row.name, lx + 3.2, ly, 7.2, { max: listW - 28 });
        pen.text(`${Math.round((row.value / total) * 100)}%`, lx + listW - 14, ly, 6.8, { colour: MUTED, align: "right" });
        pen.text(format(row.value), lx + listW, ly, 7.2, { weight: "bold", align: "right" });
      });
      if (rows.length > shown.length) pen.text(`and ${rows.length - shown.length} more types`, lx + 3.2, y + shown.length * perRow, 6.8, { colour: MUTED });
    },
  };
}

const BANDS: Array<{ key: "inProgress" | "scheduled" | "overdue" | "undated"; label: string; colour: string }> = [
  { key: "inProgress", label: "In progress", colour: AMBER },
  { key: "scheduled", label: "Scheduled", colour: SKY },
  { key: "overdue", label: "Overdue", colour: RED },
  { key: "undated", label: "No date", colour: SLATE },
];

/** A bar per person, split by the state the work is in. */
function workloadBars(rows: WorkloadRow[], limit = 22): Figure {
  const shown = rows.slice(0, limit);
  const rowH = 5.6;
  return {
    height: () => 8 + Math.max(1, shown.length) * rowH + (rows.length > shown.length ? 5 : 0),
    draw: (pen, x, y, w) => {
      let kx = x;
      for (const band of BANDS) kx = pen.key(kx, y, band.colour, band.label);
      if (!shown.length) return pen.text("Nobody is carrying work in this window.", x, y + 8, 8, { colour: MUTED });
      const labelW = 44;
      const valueW = 34;
      const trackW = w - labelW - valueW - 3;
      const peak = Math.max(1, ...shown.map((r) => r.tasks));
      shown.forEach((row, i) => {
        const ry = y + 7 + i * rowH;
        pen.text(row.name, x, ry + 0.5, 7.6, { max: labelW - 2 });
        pen.fill(x + labelW, ry + 1, trackW, 2.8, TRACK, 1.4);
        let bx = x + labelW;
        const full = (row.tasks / peak) * trackW;
        for (const band of BANDS) {
          const part = row.tasks ? (row[band.key] / row.tasks) * full : 0;
          pen.fill(bx, ry + 1, part, 2.8, band.colour);
          bx += part;
        }
        pen.text(`${formatCount(row.tasks)} ${row.tasks === 1 ? "task" : "tasks"}`, x + labelW + trackW + 3, ry + 0.5, 7.4, { weight: "bold" });
        if (row.overdue > 0) pen.text(`${formatCount(row.overdue)} late`, x + w, ry + 0.5, 7.2, { weight: "bold", colour: RED, align: "right" });
      });
      if (rows.length > shown.length) pen.text(`and ${rows.length - shown.length} more people`, x, y + 7 + shown.length * rowH + 1, 7, { colour: MUTED });
    },
  };
}

/** Each person's work, a column per department. */
function departmentTable(rows: WorkloadRow[], groups: Array<{ key: string; name: string }>, format: (v: number) => string): Figure {
  const columns = groups.slice(0, 6);
  const restKeys = new Set(groups.slice(6).map((g) => g.key));
  const people = rows
    .map((row) => ({ row, total: row.byDepartment.reduce((sum, cell) => sum + cell.total, 0) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
  const rowH = 5.4;
  return {
    height: () => 7 + Math.max(1, people.length) * rowH,
    draw: (pen, x, y, w) => {
      const nameW = 44;
      const cols = columns.length + (restKeys.size ? 1 : 0) + 1;
      const colW = (w - nameW) / cols;
      const heads = [...columns.map((g) => g.name), ...(restKeys.size ? [`${restKeys.size} more`] : []), "Total"];
      heads.forEach((head, i) => pen.text(head, x + nameW + (i + 1) * colW - 1, y, 6.8, { weight: "bold", colour: MUTED, align: "right", max: colW - 2 }));
      pen.line(x, y + 4.4, x + w, y + 4.4);
      const hottest = Math.max(1, ...people.flatMap(({ row }) => row.byDepartment.map((c) => c.total)));
      people.forEach(({ row, total }, r) => {
        const ry = y + 6.2 + r * rowH;
        if (r % 2 === 1) pen.fill(x, ry - 0.9, w, rowH, "#fafbfd");
        pen.text(row.name, x, ry, 7.4, { max: nameW - 2 });
        const values = [...columns.map((g) => row.byDepartment.find((c) => c.key === g.key)?.total ?? 0), ...(restKeys.size ? [row.byDepartment.filter((c) => restKeys.has(c.key)).reduce((s, c) => s + c.total, 0)] : [])];
        values.forEach((value, i) => {
          const cx = x + nameW + i * colW;
          const group = columns[i];
          if (value > 0 && group) pen.fill(cx + 1, ry - 0.7, colW - 1.5, rowH - 0.6, tint(departmentHex(group.name), 1 - Math.min(0.55, 0.12 + (value / hottest) * 0.45)), 0.6);
          pen.text(value ? format(value) : "-", cx + colW - 1, ry, 7.2, { colour: value ? INK : FAINT, align: "right" });
        });
        pen.text(format(total), x + w - 1, ry, 7.2, { weight: "bold", align: "right" });
      });
    },
  };
}

/** A delivery figure, what it was a year ago, and the teams and departments behind it. */
function ratePanel(figure: RateFigure, format: (v: number) => string, better: "lower" | "higher", countLabel: string, comparisonLabel: string, max?: number): Figure {
  const rows = Math.max(Math.min(6, figure.byTeam.length), Math.min(6, figure.byDepartment.length), 1);
  return {
    height: () => (figure.value === null ? 12 : 20 + rows * 6.4),
    draw: (pen, x, y, w) => {
      if (figure.value === null) return pen.text("Nothing finished in this period.", x, y + 2, 8, { colour: MUTED });
      const value = format(figure.value);
      pen.text(value, x, y, 24, { weight: "bold", colour: NAVY });
      const after = x + pen.width(value, 24, "bold") + 3.5;
      pen.text(`${formatCount(figure.count)} ${countLabel}`, after, y + 1.4, 8, { colour: MUTED });
      if (figure.comparison !== null) {
        const change = better === "lower" ? figure.comparison - figure.value : figure.value - figure.comparison;
        pen.text(`${comparisonLabel}: ${format(figure.comparison)}`, after, y + 5.6, 8, { weight: "bold", colour: Math.abs(change) < 1e-9 ? MUTED : change > 0 ? GREEN : RED });
      }
      const half = (w - 8) / 2;
      pen.caps("By team", x, y + 13, 6.4, MUTED);
      pen.caps("By department", x + half + 8, y + 13, 6.4, MUTED);
      rankedBars(figure.byTeam.slice(0, 6), format, { max, label: 27, empty: "No team finished work." }).draw(pen, x, y + 17.5, half, 0);
      rankedBars(figure.byDepartment.slice(0, 6), format, { max, label: 27, empty: "Nothing carries a department." }).draw(pen, x + half + 8, y + 17.5, half, 0);
    },
  };
}

/** New against finished, with what each stretch did to the backlog under it. */
function inOutColumns(buckets: FlowBucket[]): Figure {
  return {
    height: () => 84,
    draw: (pen, x, y, w, h) => {
      const happened = buckets.filter((b) => b.in !== null);
      const totalIn = happened.reduce((s, b) => s + (b.in ?? 0), 0);
      const totalOut = happened.reduce((s, b) => s + (b.out ?? 0), 0);
      const kx = pen.key(x, y, RED, "New");
      pen.key(kx, y, GREEN, "Finished");
      const net = totalIn - totalOut;
      const summary = `${formatCount(totalIn)} in · ${formatCount(totalOut)} out · finish rate ${totalIn ? formatPercent((totalOut / totalIn) * 100) : "-"} · backlog ${net > 0 ? "+" : ""}${formatCount(net)}`;
      pen.text(summary, x + w, y, 7.4, { weight: "bold", colour: net > 0 ? RED : GREEN, align: "right" });
      const peak = Math.max(1, ...buckets.map((b) => Math.max(b.in ?? 0, b.out ?? 0)));
      const plotBottom = y + h - 10;
      const { left, yOf } = axis(pen, x, w, y + 10, plotBottom, peak, formatCount);
      const slot = (x + w - left) / Math.max(1, buckets.length);
      const bar = Math.min(9, slot * 0.34);
      const every = slot < 9 ? 2 : 1;
      buckets.forEach((b, i) => {
        const centre = left + i * slot + slot / 2;
        if (b.in !== null) {
          pen.fill(centre - bar - 0.4, yOf(b.in), bar, plotBottom - yOf(b.in), RED, 0.6);
          if (b.in > 0 && bar >= 3) pen.text(formatCount(b.in), centre - bar / 2 - 0.4, yOf(b.in) - 0.8, 6.2, { weight: "bold", align: "center", baseline: "bottom" });
        }
        if (b.out !== null) {
          pen.fill(centre + 0.4, yOf(b.out), bar, plotBottom - yOf(b.out), GREEN, 0.6);
          if (b.out > 0 && bar >= 3) pen.text(formatCount(b.out), centre + bar / 2 + 0.4, yOf(b.out) - 0.8, 6.2, { weight: "bold", align: "center", baseline: "bottom" });
        }
        if (i % every) return;
        pen.text(b.label, centre, plotBottom + 1.4, 6.6, { colour: b.in === null ? FAINT : MUTED, align: "center" });
        if (b.in !== null) {
          const change = (b.in ?? 0) - (b.out ?? 0);
          pen.text(`${change > 0 ? "+" : change < 0 ? "-" : ""}${formatCount(Math.abs(change))}`, centre, plotBottom + 4.9, 6.6, { weight: "bold", colour: change > 0 ? RED : change < 0 ? GREEN : MUTED, align: "center" });
        }
      });
    },
  };
}

/**
 * Work types: the radar on the left — rings, spokes, last year dashed, this
 * period filled in a light tint of the brand red, each point in its work
 * type's colour — and on the right a table of each work type in figures, then
 * the people behind them as bars split by work type.
 */
function workTypesFigure(profile: WorkTypeProfile, people: Array<{ name: string; parts: Array<{ value: number; color: string }>; total: number }>, format: (v: number) => string, unit: string, currentLabel: string, comparisonLabel: string): Figure {
  const rows = profile.rows;
  const shownPeople = people.slice(0, 10);
  const tableH = 7 + rows.length * 8.2;
  const peopleH = shownPeople.length ? 9 + shownPeople.length * 5.2 : 0;
  return {
    height: (width) => Math.max(width * 0.42 * 0.86 + 8, tableH + peopleH + 6),
    draw: (pen, x, y, w) => {
      if (rows.length < 3) return pen.text("Group the asset types into at least three work types (Settings -> Asset types) to draw this.", x, y + 2, 8, { colour: MUTED });
      const doc = pen.doc;
      const radarW = w * 0.42;
      const cx = x + radarW / 2;
      const cy = y + radarW * 0.43 + 4;
      const R = radarW * 0.3;
      const peak = Math.max(1, ...rows.map((r) => Math.max(r.value, r.comparison ?? 0)));
      const { top, ticks } = niceScale(peak, 4, unit !== "hours");
      const n = rows.length;
      const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const at = (i: number, radius: number) => [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))] as const;
      const point = (i: number, value: number) => at(i, (Math.max(0, value) / top) * R);
      // A closed shape through the points, as jsPDF wants it: a start and the steps between.
      const polygon = (pts: ReadonlyArray<readonly [number, number]>, style: "F" | "S" | "FD") => {
        const [x0, y0] = pts[0]!;
        const steps = pts.slice(1).map(([px, py], k) => [px - pts[k]![0], py - pts[k]![1]]);
        doc.lines(steps, x0, y0, [1, 1], style, true);
      };

      // The plate and the rings.
      pen.dot(cx, cy, R + 3, SURFACE);
      doc.setDrawColor(RULE);
      for (const t of ticks.filter((v) => v > 0)) {
        doc.setLineWidth(t === top ? 0.3 : 0.18);
        if (t !== top) doc.setLineDashPattern([0.4, 1.2], 0);
        doc.circle(cx, cy, (t / top) * R, "S");
        doc.setLineDashPattern([], 0);
        pen.text(format(t), cx + 1.2, cy - (t / top) * R - 2.6, 5.8, { colour: FAINT });
      }
      rows.forEach((_, i) => {
        const [sx, sy] = at(i, R);
        pen.line(cx, cy, sx, sy, RULE, 0.2);
      });

      // Last year, dashed; this period, a tint with a solid edge.
      if (profile.comparisonTotal !== null) {
        doc.setDrawColor(SLATE);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([1.4, 1.1], 0);
        polygon(rows.map((r, i) => point(i, r.comparison ?? 0)), "S");
        doc.setLineDashPattern([], 0);
      }
      doc.setFillColor(tint(RED, 0.84));
      doc.setDrawColor(RED);
      doc.setLineWidth(0.55);
      polygon(rows.map((r, i) => point(i, r.value)), "FD");
      rows.forEach((row, i) => {
        if (profile.comparisonTotal !== null) {
          const [px, py] = point(i, row.comparison ?? 0);
          doc.setFillColor("#ffffff");
          doc.setDrawColor(SLATE);
          doc.setLineWidth(0.3);
          doc.circle(px, py, 0.7, "FD");
        }
        const [qx, qy] = point(i, row.value);
        doc.setFillColor(colorClasses(row.workType.color).hex);
        doc.setDrawColor("#ffffff");
        doc.setLineWidth(0.4);
        doc.circle(qx, qy, 1.15, "FD");
      });

      // Names round the rim: the name, then the figure and share.
      rows.forEach((row, i) => {
        const a = angle(i);
        const [lx, ly] = at(i, R + 6);
        const align = Math.abs(Math.cos(a)) < 0.3 ? "center" : Math.cos(a) > 0 ? "left" : "right";
        const yTop = Math.sin(a) < -0.5 ? ly - 7 : Math.sin(a) > 0.5 ? ly : ly - 3.5;
        pen.text(row.workType.name, lx, yTop, 7.4, { weight: "bold", align, colour: INK });
        pen.text(`${format(row.value)} · ${profile.total > 0 ? Math.round((row.value / profile.total) * 100) : 0}%`, lx, yTop + 3.4, 6.6, { align, colour: MUTED });
      });

      // What the two shapes are.
      const keyY = y + radarW * 0.86;
      let kx = x + 4;
      kx = pen.key(kx, keyY, tint(RED, 0.6), currentLabel);
      if (profile.comparisonTotal !== null) pen.key(kx, keyY, SLATE, `${comparisonLabel} (dashed)`);

      // The table: one row per work type, biggest first.
      const tx = x + radarW + 6;
      const tw = w - radarW - 6;
      const cols = { value: tx + tw * 0.36, share: tx + tw * 0.47, before: tx + tw * 0.6, change: tx + tw * 0.71, done: tx + tw * 0.82 };
      pen.caps("Work type", tx, y, 6, FAINT);
      pen.caps(unit, cols.value, y, 6, FAINT);
      pen.caps("Share", cols.share, y, 6, FAINT);
      pen.caps("Before", cols.before, y, 6, FAINT);
      pen.caps("Change", cols.change, y, 6, FAINT);
      pen.caps("Delivered", cols.done, y, 6, FAINT);
      const ranked = [...rows].sort((a, b) => b.value - a.value);
      ranked.forEach((row, k) => {
        const ry = y + 6 + k * 8.2;
        const hex = colorClasses(row.workType.color).hex;
        pen.fill(tx, ry + 0.4, 2.4, 2.4, hex, 0.5);
        pen.text(row.workType.name, tx + 3.6, ry, 7.8, { weight: "bold", max: cols.value - tx - 6 });
        pen.text(row.topTypes.slice(0, 3).map((t) => `${t.type} x${formatCount(t.units)}`).join(" · ") || "No deliverables", tx + 3.6, ry + 3.6, 6.2, { colour: MUTED, max: tw * 0.98 - 3.6 });
        pen.text(format(row.value), cols.value, ry, 7.8, { weight: "bold" });
        pen.text(`${profile.total > 0 ? Math.round((row.value / profile.total) * 100) : 0}%`, cols.share, ry, 7.6);
        pen.text(row.comparison !== null ? format(row.comparison) : "—", cols.before, ry, 7.6, { colour: MUTED });
        const change = row.comparison !== null && row.comparison > 0 ? (row.value - row.comparison) / row.comparison : null;
        pen.text(change === null ? "—" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`, cols.change, ry, 7.6, { weight: "bold", colour: change === null ? MUTED : change >= 0 ? GREEN : RED });
        pen.text(row.units > 0 ? `${Math.round((row.doneUnits / row.units) * 100)}%` : "—", cols.done, ry, 7.6);
        pen.line(tx, ry + 7.2, tx + tw, ry + 7.2, TRACK, 0.2);
      });
      if (profile.unassignedUnits > 0) pen.text(`${formatCount(profile.unassignedUnits)} units in types with no work type are not counted.`, tx, y + 6 + ranked.length * 8.2, 6.2, { colour: FAINT });

      // The people behind them: a bar each, split by work type.
      if (shownPeople.length) {
        const py0 = y + tableH + 6;
        pen.caps("By person", tx, py0, 6, FAINT);
        const labelW = Math.min(38, tw * 0.28);
        const valueW = 16;
        const trackW = tw - labelW - valueW - 2;
        const max = Math.max(1, ...shownPeople.map((p) => p.total));
        shownPeople.forEach((p, k) => {
          const ry = py0 + 5 + k * 5.2;
          pen.text(p.name, tx, ry, 7, { max: labelW - 2 });
          pen.fill(tx + labelW, ry + 0.8, trackW, 2.4, TRACK, 1.2);
          let bx = tx + labelW;
          for (const part of p.parts) {
            const pw = (part.value / max) * trackW;
            pen.fill(bx, ry + 0.8, pw, 2.4, part.color);
            bx += pw;
          }
          pen.text(format(p.total), tx + tw, ry, 7, { weight: "bold", align: "right" });
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The report

interface Section {
  topic: HelpTopic;
  title: string;
  /** The line under the title, as the panel's own subtitle says it. */
  subtitle: string;
  figure: Figure;
  /** The chart across the page, the explanation in four columns under it. */
  wide?: boolean;
}

/** Every panel of the page, in its order, built from the figures the page draws. */
export function reportSections(props: DashboardViewProps): Section[] {
  const { facts, report, monthly, monthlyTasks, monthlyAssets, monthlyEffort, rates, ops, prefs, measure, valueOf, today } = props;
  const period = report.period;
  const unitWord = MEASURE_UNITS[measure];
  const format = measure === "effort" ? formatHours : formatCount;
  const scoped = report.current.tasks;
  const by = (keyOf: (t: (typeof scoped)[number]) => { id: string; name: string; color: string } | null) => {
    const rows = new Map<string, NamedCount>();
    for (const task of scoped) {
      const key = keyOf(task);
      if (!key) continue;
      const row = rows.get(key.id) ?? { id: key.id, name: key.name, value: 0, color: key.color };
      row.value += valueOf(task);
      rows.set(key.id, row);
    }
    return [...rows.values()].sort((a, b) => b.value - a.value);
  };
  const byTeam = by((t) => ({ id: t.team.id, name: t.team.name, color: teamHex(t.team) }));
  const byDepartment = by((t) => (t.department ? { id: t.department.name, name: t.department.name, color: departmentHex(t.department.name) } : null));
  const byEffort = measure === "effort";
  const mix = byEffort ? assetEffortMix(report.current.assets, rates) : assetMix(report.current.assets);

  // Who is carrying what, narrowed exactly as the panel is.
  const all = assignedWorkload(facts, today, prefs.teamIds, prefs.weeks);
  const groups = workloadDepartments(all);
  const group = groups.find((g) => g.key === prefs.stakeholderGroup) ?? null;
  const people = (group ? workloadForDepartment(all, group.key) : all).filter((r) => r.userId !== null && r.tasks > 0);
  const measured = assignedWorkload(facts, today, prefs.teamIds, prefs.weeks, valueOf);
  const measuredPeople = (group ? workloadForDepartment(measured, group.key) : measured).filter((r) => r.userId !== null);

  const details = operationsDetails(ops);
  const speed = turnaround(facts, period, prefs.teamIds);
  const punctual = onTime(facts, period, prefs.teamIds);
  const returned = sentBack(facts, period, prefs.teamIds);
  const flow = inAndOut(facts, period, prefs.teamIds, today);
  const basisLine = `${prefs.basis === "created" ? "Requested" : "Scheduled"} in ${period.label}`;

  // Work types: the team's profile, and each of the busiest people split across it.
  const workTypeSections: Section[] = [];
  if (props.workTypes.workTypes.length > 0) {
    const kinds = props.workTypes;
    const profile = workTypeProfile(report.current.assets, report.comparison?.assets ?? null, kinds, measure, rates);
    const people = workTypeContributors(report.current.assets, kinds)
      .slice(0, 10)
      .map(({ userId }) => {
        const own = workTypeProfile(report.current.assets, null, kinds, measure, rates, userId);
        return { name: facts.users.get(userId)?.displayName ?? "Someone who has left", parts: own.rows.map((r) => ({ value: r.value, color: colorClasses(r.workType.color).hex })), total: own.total };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total);
    workTypeSections.push({
      topic: "workTypes",
      title: "Work types",
      subtitle: `${period.label} · ${unitWord} by work type${report.comparison ? ` · dashed is ${period.comparisonLabel}` : ""}`,
      figure: workTypesFigure(profile, people, format, unitWord, period.label, period.comparisonLabel),
      wide: true,
    });
  }

  const sections: Section[] = [];
  if (hasAnyRate(rates)) sections.push({ topic: "effort", title: "Effort", subtitle: basisLine, figure: headline(report.effort, "hours", formatHours, monthlyEffort, period.comparisonLabel) });
  sections.push(
    { topic: "tasks", title: "Tasks", subtitle: basisLine, figure: headline(report.tasks, "tasks", formatCount, monthlyTasks, period.comparisonLabel) },
    { topic: "assets", title: "Asset units", subtitle: basisLine, figure: headline(report.assetUnits, "units", formatCount, monthlyAssets, period.comparisonLabel) },
    { topic: "byMonth", title: `${MEASURE_LABELS[measure]} by month`, subtitle: `${period.label} against ${period.comparisonLabel}`, figure: monthColumns(monthly, format, period.label, period.comparisonLabel) },
    { topic: "byTeam", title: "By team", subtitle: unitWord, figure: rankedBars(byTeam.slice(0, 5), format, { empty: "No work in this period." }) },
    { topic: "byDepartment", title: "By department", subtitle: unitWord, figure: rankedBars(byDepartment.slice(0, 5), format, { empty: "Nothing carries a department." }) },
    { topic: "priority", title: "Priority", subtitle: "tasks", figure: rankedBars(priorityMix(scoped), formatCount, { empty: "Nothing to split yet." }) },
    {
      topic: "operations",
      title: "Current operations",
      subtitle: `As of ${ops.asOf} · these overlap and are not a total`,
      figure: operationsTiles([
        { label: "Open and overdue", count: ops.overdue.length, urgent: true, details: details.overdue },
        { label: "Due within 7 days", count: ops.dueThisWeek.length, details: details.week },
        { label: "Awaiting allocation", count: ops.unallocated.length, details: details.unallocated },
        { label: "Blocked", count: ops.blocked.length, details: details.blocked },
      ]),
    },
    { topic: "assetTypes", title: "Asset types", subtitle: `${(byEffort ? formatHours : formatCount)(mix.reduce((s, r) => s + r.value, 0))} ${byEffort ? "" : "units "}across ${mix.length} types`, figure: assetMap(mix, byEffort ? formatHours : formatCount), wide: true },
    ...workTypeSections,
    { topic: "workload", title: "Who is carrying what", subtitle: `${group ? `Work for ${group.name} · ` : ""}Tasks due in the next ${prefs.weeks} weeks, plus everything overdue or undated`, figure: workloadBars(people), wide: true },
  );
  if (!group && groups.length > 1) {
    sections.push({ topic: "matrix", title: "Per person, per department", subtitle: `${MEASURE_LABELS[measure]} each person holds for each department`, figure: departmentTable(measuredPeople, workloadDepartments(measured), format), wide: true });
  }
  sections.push(
    { topic: "turnaround", title: "Turnaround", subtitle: "Median days, made to done", figure: ratePanel(speed, formatDays, "lower", "finished", period.comparisonLabel) },
    { topic: "onTime", title: "On time", subtitle: "Finished by the due date", figure: ratePanel(punctual, formatPercent, "higher", "with a due date", period.comparisonLabel, 100) },
    { topic: "sentBack", title: "Sent back", subtitle: `Reopened, or returned from review · ${formatCount(returned.times)} ${returned.times === 1 ? "time" : "times"}`, figure: ratePanel(returned, formatPercent, "lower", "finished", period.comparisonLabel, 100) },
    { topic: "inAndOut", title: "In and out", subtitle: `New and finished tasks by ${flow.weekly ? "week" : "month"} · ${period.label}`, figure: inOutColumns(flow.buckets), wide: true },
  );
  return sections;
}

/** Builds the report and returns it, unsaved. */
export async function buildDashboardPdf(props: DashboardViewProps, meta: ExportMeta, now: Date = new Date()): Promise<JsPdf> {
  const [{ jsPDF }, streamline, rmit] = await Promise.all([import("jspdf"), loadPng("/logo-light.svg", 900), loadPng("/brand/rmit-logo.png", 600)]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pen = new Pen(doc);
  const stamp = reportTimestamp(now, meta.timezone);
  const sections = reportSections(props);

  // ---- Plan every block first, so the cover's contents can give page numbers --
  const columnW = (CONTENT_W - 3 * 6) / 4;
  const sideHeight = (topic: HelpTopic, width: number) =>
    SECTIONS.reduce((sum, s) => sum + 3.8 + pen.wrap(DASHBOARD_HELP[topic][s.key], width, TEXT_SIZE, s.key === "shows" ? "bold" : "normal").length * pen.lineHeight(TEXT_SIZE) + 2.4, 0);
  const columnsHeight = (topic: HelpTopic) => 4.2 + Math.max(...SECTIONS.map((s) => pen.wrap(DASHBOARD_HELP[topic][s.key], columnW, TEXT_SIZE, s.key === "shows" ? "bold" : "normal").length)) * pen.lineHeight(TEXT_SIZE);
  const plan: Array<{ section: Section; page: number; y: number; chartW: number; chartH: number }> = [];
  let page = 2;
  let y = TOP;
  for (const section of sections) {
    const chartW = section.wide ? CONTENT_W : CONTENT_W * CHART_SHARE;
    const textH = section.wide ? columnsHeight(section.topic) + 7 : sideHeight(section.topic, CONTENT_W - chartW - GAP);
    const chartH = Math.min(section.figure.height(chartW), BOTTOM - TOP - HEAD_H - 2 - (section.wide ? textH : 0));
    const height = HEAD_H + 2 + (section.wide ? chartH + textH : Math.max(chartH, textH));
    if (y > TOP && y + height > BOTTOM) {
      page += 1;
      y = TOP;
    }
    plan.push({ section, page, y, chartW, chartH });
    y += height + 8;
  }

  // ---- The cover -------------------------------------------------------------
  pen.fill(0, 0, PAGE_W, 64, NAVY);
  pen.fill(0, 64, PAGE_W, 2.5, RED);
  if (rmit) doc.addImage(rmit.data, "PNG", PAGE_W - MARGIN - 38, 12, 38, 38 * rmit.ratio);
  pen.caps("RMIT Creative Team", MARGIN, 16, 10, "#ffffff");
  pen.text("Dashboard report", MARGIN, 26, 28, { weight: "bold", colour: "#ffffff" });
  pen.text(meta.workspaceName, MARGIN, 40, 13, { colour: "#d6d8ec" });
  pen.text(`${meta.periodLabel}, against ${meta.comparisonLabel}`, MARGIN, 48, 10, { colour: "#d6d8ec" });

  const leftW = 120;
  let cy = 78;
  pen.caps("About this report", MARGIN, cy, 9, RED);
  cy += 7;
  const facts: Array<[string, string]> = [
    ["Period", `${meta.periodLabel}, against ${meta.comparisonLabel}`],
    ["Read in", meta.measureLabel],
    ["Dated by", meta.basisLabel],
    ["Teams", meta.teamsLabel],
    ["Generated", stamp],
    ...(meta.generatedBy ? ([["By", meta.generatedBy]] as Array<[string, string]>) : []),
  ];
  for (const [label, value] of facts) {
    pen.text(label.toUpperCase(), MARGIN, cy + 0.4, 8, { weight: "bold", colour: MUTED });
    cy = pen.write(value, MARGIN + 24, cy, leftW - 24, 10) + 2.4;
  }
  cy += 1.5;
  pen.line(MARGIN, cy, MARGIN + leftW, cy);
  pen.write(
    "Each panel of the dashboard is drawn again here from the same figures, with what it shows, how it's counted, how to read it and what to do about it. The headline figures and the charts under them follow the period; Current operations, the workload and the delivery figures describe the work as it stands today.",
    MARGIN,
    cy + 3.5,
    leftW,
    8.6,
    "normal",
    MUTED,
  );

  const cx = MARGIN + leftW + 22;
  const cw = MARGIN + CONTENT_W - cx;
  let ky = 78;
  pen.caps("Contents", cx, ky, 9, RED);
  ky += 7;
  const rowH = Math.min(5.6, (146 - ky) / plan.length);
  for (const item of plan) {
    pen.text(item.section.title, cx, ky, 9.2);
    pen.text(String(item.page), cx + cw, ky, 9.2, { colour: MUTED, align: "right" });
    pen.line(cx + pen.width(item.section.title, 9.2) + 2, ky + 2.8, cx + cw - 6, ky + 2.8, RULE, 0.2, [0.4, 1.2]);
    ky += rowH;
  }

  // At a glance, across the foot of the cover.
  const { report, ops } = props;
  const glance = [
    { label: "Tasks", value: formatCount(report.tasks.current), note: report.tasks.comparison === null ? "" : `${formatCount(report.tasks.comparison)} in ${meta.comparisonLabel}` },
    { label: "Asset units", value: formatCount(report.assetUnits.current), note: report.assetUnits.comparison === null ? "" : `${formatCount(report.assetUnits.comparison)} in ${meta.comparisonLabel}` },
    { label: "Open and overdue", value: formatCount(ops.overdue.length), note: "As of today", urgent: ops.overdue.length > 0 },
    { label: "Due within 7 days", value: formatCount(ops.dueThisWeek.length), note: "As of today" },
    { label: "Blocked", value: formatCount(ops.blocked.length), note: "As of today" },
  ];
  const gy = 152;
  pen.caps("At a glance", MARGIN, gy, 9, RED);
  const tileW = (CONTENT_W - 4 * 5) / 5;
  glance.forEach((item, i) => {
    const x = MARGIN + i * (tileW + 5);
    pen.fill(x, gy + 6, tileW, 28, SURFACE, 2.5);
    pen.fill(x, gy + 6, 1.4, 28, item.urgent ? RED : NAVY);
    pen.text(item.value, x + 6, gy + 9.5, 20, { weight: "bold", colour: item.urgent ? RED : NAVY });
    pen.text(item.label, x + 6, gy + 20.5, 8.5, { weight: "bold" });
    if (item.note) pen.text(item.note, x + 6, gy + 25, 7.4, { colour: MUTED, max: tileW - 9 });
  });

  // ---- The panels ------------------------------------------------------------
  let drawn = 1;
  for (const item of plan) {
    while (drawn < item.page) {
      doc.addPage();
      drawn += 1;
      pen.fill(0, 0, PAGE_W, 12, NAVY);
      pen.fill(0, 12, PAGE_W, 1.2, RED);
      pen.text("Dashboard report", MARGIN, 4.2, 9, { weight: "bold", colour: "#ffffff" });
      pen.text(`${meta.workspaceName} · ${meta.periodLabel}`, PAGE_W - MARGIN, 4.2, 9, { colour: "#d6d8ec", align: "right" });
    }
    const { section, chartW, chartH } = item;
    const help = DASHBOARD_HELP[section.topic];
    const titleW = pen.width(section.title, 14, "bold");
    pen.text(section.title, MARGIN, item.y, 14, { weight: "bold", colour: NAVY });
    pen.text(section.subtitle, MARGIN + titleW + 4, item.y + 1.9, 8.4, { colour: MUTED, max: CONTENT_W - titleW - 4 });
    pen.fill(MARGIN, item.y + 6.8, 14, 1, RED);
    const top = item.y + HEAD_H + 2;
    section.figure.draw(pen, MARGIN, top, chartW, chartH);

    if (section.wide) {
      const ty = top + chartH + 6;
      pen.line(MARGIN, ty - 3, MARGIN + CONTENT_W, ty - 3);
      SECTIONS.forEach((s, i) => {
        const tx = MARGIN + i * (columnW + 6);
        pen.caps(s.label, tx, ty, 7.2, s.key === "act" ? RED : MUTED);
        pen.write(help[s.key], tx, ty + 4.2, columnW, TEXT_SIZE, s.key === "shows" ? "bold" : "normal", s.key === "shows" ? NAVY : INK);
      });
    } else {
      const tx = MARGIN + chartW + GAP;
      const tw = MARGIN + CONTENT_W - tx;
      pen.line(tx - GAP / 2, top, tx - GAP / 2, top + Math.max(chartH, sideHeight(section.topic, tw)) - 3);
      let ty = top;
      for (const s of SECTIONS) {
        pen.caps(s.label, tx, ty, 7.2, s.key === "act" ? RED : MUTED);
        ty = pen.write(help[s.key], tx, ty + 3.8, tw, TEXT_SIZE, s.key === "shows" ? "bold" : "normal", s.key === "shows" ? NAVY : INK) + 2.4;
      }
    }
  }

  // ---- Footers, now the page count is known ----------------------------------
  const pages = doc.getNumberOfPages();
  const who = [...new Set(["RMIT Creative Team", meta.workspaceName])].join(" · ");
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    pen.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
    if (streamline) doc.addImage(streamline.data, "PNG", MARGIN, PAGE_H - 7.6, 16, 16 * streamline.ratio);
    pen.text(`${who} · Generated ${stamp}`, MARGIN + (streamline ? 19 : 0), PAGE_H - 7, 7.5, { colour: MUTED });
    pen.text(`Page ${n} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 7, 7.5, { colour: MUTED, align: "right" });
  }

  doc.setProperties({ title: `Dashboard report · ${meta.workspaceName}`, subject: `${meta.periodLabel} against ${meta.comparisonLabel}`, author: meta.generatedBy ?? "Streamline", creator: "Streamline" });
  return doc;
}

/** Builds the report and hands it to the browser as a download. */
export async function exportDashboardPdf(props: DashboardViewProps, meta: ExportMeta, now: Date = new Date()): Promise<void> {
  const doc = await buildDashboardPdf(props, meta, now);
  doc.save(reportFileName(meta.workspaceSlug, now, meta.timezone));
}
