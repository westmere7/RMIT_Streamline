"use client";

import * as React from "react";
import { AvatarStack } from "@/components/shared/user-avatar";
import type { BoardColumn, ColumnLabel, Item } from "@/domain";
import { columnLabels } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { columnCellStyle } from "@/features/boards/board-model";
import { useTableLayout } from "@/features/boards/components/table/table-layout";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * What a folded group holds, one cell per column.
 *
 * A collapsed group used to keep its name, a count and a status bar, which
 * says how the work stands and nothing about who has it, when it is due or
 * how much of it there is. This row sits where the group's rows would be and
 * answers each column's question for the whole group at once: a status column
 * shows how the items split across its labels, a people column who is on
 * them, a date column the span and how many have slipped, a number column the
 * total. Every cell is aligned under its column, so a board with three groups
 * folded reads as three summary lines down the same columns.
 */
export function GroupSummaryRow({ leading, items, widthOverrides }: { leading: React.ReactNode; items: readonly Item[]; widthOverrides: Record<string, number> }) {
  const { model } = useBoardContext();
  const layout = useTableLayout();
  return (
    <div role="row" className="flex h-11 items-center rounded-xl border border-border/60 bg-background shadow-xs" data-testid="group-summary">
      {/* The group's own heading — chevron, name, count — sized as the frozen
          head of a row, so the name sits where the item names would. */}
      {leading}
      {model.visibleColumns.map((column) => (
        <div
          key={column.id}
          role="gridcell"
          className="flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-border/50 px-2 text-2xs text-muted-foreground"
          style={columnCellStyle(widthOverrides[column.id] ?? column.width)}
          data-testid={`group-summary-${column.type.toLowerCase()}`}
        >
          <ColumnSummary column={column} items={items} />
        </div>
      ))}
      <div style={{ width: layout.trailingWidth }} />
    </div>
  );
}

/** One column's answer for the group. Null when the column has nothing worth summing up. */
function ColumnSummary({ column, items }: { column: BoardColumn; items: readonly Item[] }) {
  const { model, users } = useBoardContext();
  const values = items.map((item) => model.getValue(item.id, column.id));

  switch (column.type) {
    case "STATUS":
    case "DROPDOWN":
    case "PRIORITY": {
      const labels = columnLabels(column);
      const counts = new Map<string, number>();
      for (const value of values) {
        const labelId = value && "labelId" in value && value.labelId ? value.labelId : "none";
        counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
      }
      return <LabelBar labels={labels} counts={counts} total={items.length} />;
    }

    case "PERSON":
    case "PEOPLE":
    case "REQUESTER": {
      const ids = new Set<string>();
      for (const value of values) if (value && "userIds" in value) for (const id of value.userIds) ids.add(id);
      const people = [...ids].map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
      if (people.length === 0) return <Faint>nobody yet</Faint>;
      return (
        <span className="flex items-center gap-1.5" title={people.map((p) => p.displayName).join(", ")}>
          <AvatarStack users={people} size="xs" max={4} />
          <span className="tabular">{people.length}</span>
        </span>
      );
    }

    case "DATE": {
      const dates = values.map((v) => (v?.type === "DATE" ? v.date : null)).filter((d): d is string => !!d).sort();
      if (dates.length === 0) return <Faint>no dates</Faint>;
      const late = items.filter((item, i) => !model.isDone(item.id) && values[i]?.type === "DATE" && isOverdue(values[i].date)).length;
      return <DateSpan from={dates[0]!} to={dates[dates.length - 1]!} late={late} />;
    }

    case "TIMELINE": {
      const starts = values.map((v) => (v?.type === "TIMELINE" ? v.start : null)).filter((d): d is string => !!d).sort();
      const ends = values.map((v) => (v?.type === "TIMELINE" ? v.end : null)).filter((d): d is string => !!d).sort();
      if (starts.length === 0 && ends.length === 0) return <Faint>no dates</Faint>;
      const late = items.filter((item, i) => !model.isDone(item.id) && values[i]?.type === "TIMELINE" && isOverdue(values[i].end)).length;
      return <DateSpan from={starts[0] ?? ends[0]!} to={ends[ends.length - 1] ?? starts[starts.length - 1]!} late={late} />;
    }

    case "NUMBER": {
      const numbers = values.map((v) => (v?.type === "NUMBER" ? v.number : null)).filter((n): n is number => n !== null && Number.isFinite(n));
      if (numbers.length === 0) return <Faint>—</Faint>;
      const sum = numbers.reduce((a, b) => a + b, 0);
      return (
        <span className="flex items-baseline gap-1" title={`${numbers.length} of ${items.length} filled in`}>
          <span className="text-[13px] font-semibold text-foreground tabular">{formatNumber(sum)}</span>
          <span>sum</span>
        </span>
      );
    }

    case "CHECKBOX": {
      const ticked = values.filter((v) => v?.type === "CHECKBOX" && v.checked).length;
      return <Progress done={ticked} total={items.length} />;
    }

    case "TAGS": {
      const counts = new Map<string, number>();
      for (const value of values) if (value?.type === "TAGS") for (const tag of value.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (counts.size === 0) return <Faint>no tags</Faint>;
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      return (
        <span className="flex min-w-0 items-center gap-1.5" title={[...counts.entries()].map(([tag, n]) => `${tag} ×${n}`).join(", ")}>
          {top.map(([tag, n]) => (
            <span key={tag} className="truncate rounded-md bg-surface-strong/70 px-1.5 py-0.5 font-medium text-foreground/80">
              {tag} <span className="tabular text-muted-foreground">×{n}</span>
            </span>
          ))}
          {counts.size > 2 && <span className="shrink-0">+{counts.size - 2}</span>}
        </span>
      );
    }

    case "SIZE": {
      const counts = new Map<string, number>();
      for (const value of values) if (value?.type === "SIZE" && value.size) counts.set(value.size, (counts.get(value.size) ?? 0) + 1);
      if (counts.size === 0) return <Faint>no sizes</Faint>;
      return (
        <span className="flex items-center gap-2 tabular">
          {["XS", "S", "M", "L", "XL"].filter((size) => counts.has(size)).map((size) => (
            <span key={size}>
              <span className="font-semibold text-foreground/80">{size}</span> {counts.get(size)}
            </span>
          ))}
        </span>
      );
    }

    case "STAKEHOLDER": {
      const groups = new Set(values.map((v) => (v?.type === "STAKEHOLDER" ? v.group : null)).filter((g): g is string => !!g));
      if (groups.size === 0) return <Faint>nobody named</Faint>;
      const list = [...groups];
      return (
        <span className="truncate" title={list.join(", ")}>
          {list.length <= 2 ? list.join(", ") : `${list.length} groups`}
        </span>
      );
    }

    case "TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
    case "BRIEF":
    case "LINK": {
      const filled = values.filter((v) => (v && "text" in v && v.text?.trim()) || (v?.type === "LINK" && v.url)).length;
      return <Progress done={filled} total={items.length} word="filled" />;
    }

    default:
      return null;
  }
}

/** How the group splits across a column's labels, as one bar with a legend for the largest share. */
function LabelBar({ labels, counts, total }: { labels: ColumnLabel[]; counts: Map<string, number>; total: number }) {
  if (total === 0) return null;
  const shown = labels.filter((label) => (counts.get(label.id) ?? 0) > 0);
  const none = counts.get("none") ?? 0;
  const biggest = [...shown].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0];
  const title = [...shown.map((label) => `${label.name}: ${counts.get(label.id)}`), ...(none ? [`Not set: ${none}`] : [])].join(" · ");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" title={title}>
      <span className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/60" aria-hidden>
        {shown.map((label) => (
          <span key={label.id} className={colorClasses(label.color).dot} style={{ width: `${((counts.get(label.id) ?? 0) / total) * 100}%` }} />
        ))}
      </span>
      {biggest && (
        <span className="shrink-0 truncate tabular">
          {Math.round(((counts.get(biggest.id) ?? 0) / total) * 100)}% <span className={cn("font-medium", colorClasses(biggest.color).text)}>{biggest.name}</span>
        </span>
      )}
    </span>
  );
}

function DateSpan({ from, to, late }: { from: string; to: string; late: number }) {
  return (
    <span className="flex items-center gap-1.5 truncate tabular">
      <span className="text-foreground/80">{from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`}</span>
      {late > 0 && (
        <span className="rounded-md bg-red-50 px-1.5 py-px font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300" title={`${late} past their date and not done`}>
          {late} late
        </span>
      )}
    </span>
  );
}

function Progress({ done, total, word = "ticked" }: { done: number; total: number; word?: string }) {
  if (total === 0) return null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" title={`${done} of ${total} ${word}`}>
      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/60" aria-hidden>
        <span className="block h-full rounded-full bg-green-500" style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="shrink-0 tabular">
        {done}/{total}
      </span>
    </span>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground/50">{children}</span>;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}
