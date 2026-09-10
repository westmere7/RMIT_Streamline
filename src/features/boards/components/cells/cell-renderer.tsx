"use client";

import { Check, ExternalLink, Link2, TriangleAlert } from "lucide-react";
import * as React from "react";
import { PriorityPill, PrioritySignal } from "@/components/shared/priority-signal";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import type { BoardColumn, ColumnValue, ColumnValueOf, Item } from "@/domain";
import { columnLabels, columnTagOptions, emptyValueFor, formatAssetsRecap, isProgressLabel, isStuckLabel, priorityStrength, recapAssets, statusRoleIds } from "@/domain";
import { LabelPicker } from "@/features/boards/components/pickers/label-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { DatePicker, TimelinePicker } from "@/features/boards/components/pickers/date-picker";
import { DependencyPicker } from "@/features/boards/components/pickers/dependency-picker";
import { TagsEditor } from "@/features/boards/components/pickers/tags-editor";
import { SizePicker, SizePill } from "@/features/boards/components/pickers/size-picker";
import { useBoardContext } from "@/features/boards/board-context";
import { columnAlign } from "@/features/boards/board-model";
import { formatTag, normalizeTagName, tagColor, tagOptionsFor } from "@/features/boards/tag-palette";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { useBoardAssets, useItemAssetProgress } from "@/features/items/asset-hooks";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatDateRange, formatShortDate, isOverdue, isToday, todayISO } from "@/lib/dates/dates";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { cn } from "@/lib/utils";
import { CellShell, PopoverCell } from "./cell-shell";

export interface CellProps {
  item: Item;
  column: BoardColumn;
  value: ColumnValue | undefined;
  onChange: (value: ColumnValue) => void;
  readOnly: boolean;
  /** Item is done → de-emphasise dates. */
  isDone?: boolean;
  width?: number;
}

function valueOf<T extends ColumnValue["type"]>(type: T, value: ColumnValue | undefined): ColumnValueOf<T> {
  if (value && value.type === type) return value as ColumnValueOf<T>;
  return emptyValueFor(type) as ColumnValueOf<T>;
}

export function CellRenderer(props: CellProps) {
  switch (props.column.type) {
    case "STATUS":
      return <StatusCell {...props} />;
    case "PRIORITY":
      return <PriorityCell {...props} />;
    case "PERSON":
      return <PersonCell {...props} />;
    case "DATE":
      return <DateCell {...props} />;
    case "TIMELINE":
      return <TimelineCell {...props} />;
    case "TEXT":
      return <TextCell {...props} />;
    case "LONG_TEXT":
      return <LongTextCell {...props} />;
    case "NUMBER":
      return <NumberCell {...props} />;
    case "CHECKBOX":
      return <CheckboxCell {...props} />;
    case "LINK":
      return <LinkCell {...props} />;
    case "TAGS":
      return <TagsCell {...props} />;
    case "STAKEHOLDER":
      return <StakeholderCell {...props} />;
    case "SIZE":
      return <SizeCell {...props} />;
    case "ASSETS_RECAP":
      return <AssetsRecapCell {...props} />;
    case "DEPENDENCY":
      return <DependencyCell {...props} />;
  }
}

/**
 * How many chips fit in a cell before the rest become "+N".
 *
 * Estimated from the column width rather than measured: a board renders
 * hundreds of these cells and measuring each one costs a layout pass per row.
 * The estimate errs on the low side, so a chip is dropped before it would be
 * half-clipped — a cut-off chip reads as "there is more, but no idea how much".
 */
function fitChips(labels: readonly string[], width: number): number {
  const CHAR = 6.6;
  const CHIP_PADDING = 18;
  const GAP = 4;
  const MORE_BADGE = 26;
  const CELL_PADDING = 14;

  let used = CELL_PADDING;
  for (let index = 0; index < labels.length; index++) {
    const chip = (labels[index]?.length ?? 0) * CHAR + CHIP_PADDING + (index > 0 ? GAP : 0);
    const rest = labels.length - index - 1;
    if (used + chip + (rest > 0 ? MORE_BADGE : 0) > width) return Math.max(1, index);
    used += chip;
  }
  return labels.length;
}

/** The "+N" marker shown when a cell holds more than it can show. */
function MoreCount({ count }: { count: number }) {
  return <span className="shrink-0 text-2xs font-medium text-muted-foreground">+{count}</span>;
}

/** The colour the board gives its "Done" label, whatever that label is called. Null when it has none. */
function doneLabelColor(column: BoardColumn): string | null {
  if (column.settings.kind !== "status") return null;
  const ids = statusRoleIds(column.settings, "done");
  const label = columnLabels(column).find((l) => ids.includes(l.id));
  return label ? colorClasses(label.color).hex : null;
}

// ---- Status / Priority -----------------------------------------------------

export function StatusCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const { openEditLabels } = useBoardContext();
  const v = valueOf("STATUS", value);
  const labels = columnLabels(column);
  const label = labels.find((l) => l.id === v.labelId) ?? null;
  const stuck = isStuckLabel(column, v.labelId);
  const w = width ?? column.width;
  // Work under way says how far along its deliverables are: the chip itself is
  // the track, and the done share is a slightly lighter tint of its own colour.
  // Only there: before it starts there is nothing to show, and once it is done
  // the chip already says so.
  //
  // The last line ticked takes the tint away again and rings the chip instead:
  // a tint across the whole pill only washes out the colour the status is read
  // by, and the ring says "all in" more plainly than a full bar.
  const assets = useItemAssetProgress(item.boardId, item.id);
  const progress = isProgressLabel(column, v.labelId) && assets && assets.lines > 0 ? assets : null;
  // Every line ticked while the status still says the work is under way: ring the
  // chip in the board's own "Done" colour, so finished deliverables show before
  // anyone gets round to moving the status.
  const allDone = progress?.percent === 100 ? doneLabelColor(column) : null;
  return (
    <PopoverCell
      width={w}
      disabled={readOnly}
      ariaLabel={`${column.name}: ${label?.name ?? "not set"} for ${item.name}`}
      testId="status-cell"
      align={columnAlign(column.type)}
      contentClassName="p-2"
      trigger={
        label ? (
          <span className="flex h-full w-full items-center p-1.5">
            <span
              className={cn("relative flex h-full w-full items-center justify-center truncate rounded-lg text-xs font-medium shadow-xs", colorClasses(label.color).solid, stuck && "zebra")}
              style={allDone ? { outline: `2px solid ${allDone}`, outlineOffset: "1px" } : undefined}
              data-assets-complete={allDone ? "true" : undefined}
              title={progress ? `${label.name} — assets ${progress.done} of ${progress.lines} done` : undefined}
            >
              {progress && !allDone && (
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" data-testid="status-asset-progress" data-percent={progress.percent}>
                  <span className="block h-full bg-white/20 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
                </span>
              )}
              <span className="relative truncate px-2">{label.name}</span>
            </span>
          </span>
        ) : (
          <span className="flex h-full w-full items-center p-1.5">
            <span className="flex h-full w-full items-center justify-center rounded-lg bg-surface-strong/50 text-2xs text-muted-foreground">—</span>
          </span>
        )
      }
    >
      {(close) => (
        <LabelPicker
          labels={labels}
          value={v.labelId}
          stripedIds={column.settings.kind === "status" ? statusRoleIds(column.settings, "stuck") : []}
          onChange={(labelId) => {
            onChange({ type: "STATUS", labelId });
            close();
          }}
          onEditLabels={() => {
            close();
            openEditLabels(column);
          }}
        />
      )}
    </PopoverCell>
  );
}

export function PriorityCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("PRIORITY", value);
  const labels = columnLabels(column);
  const label = labels.find((l) => l.id === v.labelId) ?? null;
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      ariaLabel={`${column.name}: ${label?.name ?? "not set"} for ${item.name}`}
      testId="priority-cell"
      align={columnAlign(column.type)}
      contentClassName="p-2"
      // A block of one width, centred in the cell and left-aligned inside it: the
      // bars land on the same pixel down the whole column, and the block still sits
      // in the middle rather than against an edge. shrink-0 or the flex parent
      // squeezes it back to the width of its own text.
      trigger={<PriorityPill label={label} className="w-[70px] shrink-0 justify-start" />}
    >
      {(close) => (
        <LabelPicker
          labels={labels}
          value={v.labelId}
          appearance="soft"
          leading={(label) => <PrioritySignal level={priorityStrength(label.id)} />}
          onChange={(labelId) => {
            onChange({ type: "PRIORITY", labelId });
            close();
          }}
        />
      )}
    </PopoverCell>
  );
}

// ---- T-shirt size -----------------------------------------------------------

export function SizeCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("SIZE", value);
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      ariaLabel={`${column.name}: ${v.size ?? "not set"} for ${item.name}`}
      testId="size-cell"
      align={columnAlign(column.type)}
      contentClassName="p-2"
      trigger={<SizePill size={v.size} />}
    >
      {(close) => (
        <SizePicker
          value={v.size}
          onChange={(size) => {
            onChange({ type: "SIZE", size });
            close();
          }}
        />
      )}
    </PopoverCell>
  );
}

// ---- Assets recap --------------------------------------------------------------

/**
 * Read-only: how much there is and how many people are on it, worked out from
 * the item's live asset lines when the board has them loaded and from the stored
 * summary until then. It reads as a small badge rather than a sentence, so a
 * column of these does not look like more text among the text. Clicking opens
 * the item straight on its Assets tab, where the lines are.
 */
export function AssetsRecapCell({ item, column, value, width }: CellProps) {
  const { board, openItem } = useBoardContext();
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  const assets = useBoardAssets(board.id);
  const stored = valueOf("ASSETS_RECAP", value);
  const live = React.useMemo(() => (assets.data ? recapAssets(assets.data.filter((a) => a.itemId === item.id), todayISO()) : null), [assets.data, item.id]);
  const lines = live ? live.lines : stored.lines;
  const overdue = live ? live.overdue : stored.overdue;
  const quantity = live ? live.quantity : stored.quantity;
  const people = live ? live.assigneeIds.length : stored.people;
  const text = live ? formatAssetsRecap({ lines: live.lines, quantity: live.quantity, types: live.types, people: live.assigneeIds }) : formatAssetsRecap(stored);
  const open = () => {
    setRequestedItemTab({ itemId: item.id, tab: "assets" });
    openItem(item.id);
  };
  return (
    <CellShell width={width ?? column.width} align={columnAlign(column.type)} aria-label={`${column.name}: ${text || "no assets"} for ${item.name}`} data-testid="assets-recap-cell">
      <button type="button" onClick={open} className="flex h-full min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden px-1 text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring" title={text || "Open the Assets tab"}>
        {lines === 0 ? (
          <span className="text-2xs text-muted-foreground/60">—</span>
        ) : (
          <span
            className={cn(
              "inline-flex h-5.5 min-w-0 items-center rounded-md border border-border/60 bg-surface/70 text-2xs tabular",
              overdue > 0 && "border-red-300/80 dark:border-red-500/40",
            )}
          >
            <span className="flex min-w-0 items-center gap-1 truncate px-1.5">
              {overdue > 0 && <TriangleAlert className="size-2.5 shrink-0 text-red-600 dark:text-red-400" aria-label={`${overdue} overdue`} />}
              {/* Lines, not copies: "1 asset ×25" is one thing to make. The
                  receipt and the subitem list count it that way too. */}
              <span className="truncate text-muted-foreground">
                <span className="font-medium text-foreground">{lines}</span> {lines === 1 ? "asset" : "assets"}
                {quantity > lines && <span className="ml-1 tabular">×{quantity}</span>}
              </span>
            </span>
            <span aria-hidden className="h-full w-px shrink-0 bg-border/70" />
            <span className="shrink-0 px-1.5 text-muted-foreground">
              <span className="font-medium text-foreground">{people}</span> PIC
            </span>
          </span>
        )}
      </button>
    </CellShell>
  );
}

// ---- People ------------------------------------------------------------------

export function PersonCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const { users } = useBoardContext();
  const v = valueOf("PERSON", value);
  const assigned = v.userIds.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const allowMultiple = column.settings.kind === "person" ? column.settings.allowMultiple : true;
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${assigned.map((u) => u.displayName).join(", ") || "unassigned"} for ${item.name}`}
      testId="person-cell"
      trigger={
        assigned.length === 0 ? (
          <UserAvatar user={null} size="sm" />
        ) : assigned.length === 1 ? (
          <span className="flex items-center gap-1.5 truncate px-0.5">
            <UserAvatar user={assigned[0]} size="sm" tooltip={false} />
            <span className="truncate text-xs">{assigned[0]!.firstName}</span>
          </span>
        ) : (
          <AvatarStack users={assigned} size="sm" max={3} />
        )
      }
    >
      {(close) => (
        <PersonPicker users={users} value={v.userIds} allowMultiple={allowMultiple} onChange={(userIds) => onChange({ type: "PERSON", userIds })} onDone={close} />
      )}
    </PopoverCell>
  );
}

// ---- Dates -----------------------------------------------------------------

export function DateCell({ item, column, value, onChange, readOnly, isDone, width }: CellProps) {
  const v = valueOf("DATE", value);
  const overdue = !isDone && isOverdue(v.date);
  const today = !isDone && isToday(v.date);
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${v.date ? formatShortDate(v.date) : "not set"} for ${item.name}`}
      testId="date-cell"
      trigger={
        v.date ? (
          <span className={cn("flex items-center gap-1 text-xs tabular", overdue ? "font-medium text-red-600 dark:text-red-400" : today ? "font-medium" : isDone ? "text-muted-foreground" : "")}>
            {overdue && <TriangleAlert className="size-3" />}
            {formatShortDate(v.date)}
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground/60">—</span>
        )
      }
    >
      {(close) => <DatePicker value={v.date} onChange={(date) => onChange({ type: "DATE", date })} onDone={close} />}
    </PopoverCell>
  );
}

export function TimelineCell({ item, column, value, onChange, readOnly, isDone, width }: CellProps) {
  const v = valueOf("TIMELINE", value);
  const overdue = !isDone && isOverdue(v.end);
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${formatDateRange(v.start, v.end) || "not set"} for ${item.name}`}
      trigger={
        v.start || v.end ? (
          <span
            className={cn(
              "flex h-6 w-[calc(100%-8px)] items-center justify-center rounded-full px-2 text-2xs font-medium tabular",
              overdue ? "bg-red-100 text-red-800 dark:bg-red-500/25 dark:text-red-200" : isDone ? "bg-surface-strong text-muted-foreground" : "bg-navy-100 text-navy-800 dark:bg-navy-500/50 dark:text-navy-50",
            )}
          >
            <span className="truncate">{formatDateRange(v.start, v.end)}</span>
          </span>
        ) : (
          <span className="h-6 w-[calc(100%-8px)] rounded-full bg-surface-strong/60" />
        )
      }
    >
      {() => <TimelinePicker start={v.start} end={v.end} onChange={(range) => onChange({ type: "TIMELINE", ...range })} />}
    </PopoverCell>
  );
}

// ---- Text ------------------------------------------------------------------

function useInlineText(initial: string, commit: (next: string) => void) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initial);
  const start = () => {
    setDraft(initial);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    setEditing(false);
    if (save && draft !== initial) commit(draft);
  };
  return { editing, draft, setDraft, start, finish };
}

export function TextCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("TEXT", value);
  const { editing, draft, setDraft, start, finish } = useInlineText(v.text, (text) => onChange({ type: "TEXT", text }));
  const w = width ?? column.width;
  const align = columnAlign(column.type);
  if (editing) {
    return (
      <CellShell width={w} interactive={false} className="px-0.5">
        <input
          autoFocus
          aria-label={`${column.name} for ${item.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true);
            if (e.key === "Escape") finish(false);
          }}
          className={cn("h-8 w-full rounded-lg border border-ring bg-card px-2 text-[13px] outline-none ring-2 ring-ring/20", align === "center" && "text-center")}
        />
      </CellShell>
    );
  }
  return (
    <CellShell
      width={w}
      align={align}
      interactive={!readOnly}
      onClick={readOnly ? undefined : start}
      onKeyDown={(e) => !readOnly && e.key === "Enter" && start()}
      tabIndex={readOnly ? -1 : 0}
      aria-label={`${column.name}: ${v.text || "empty"} for ${item.name}`}
      className={cn(!readOnly && "cursor-text")}
    >
      <span className="truncate px-1">{v.text}</span>
    </CellShell>
  );
}

export function LongTextCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("LONG_TEXT", value);
  const [draft, setDraft] = React.useState(v.text);
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name} for ${item.name}`}
      contentClassName="w-80 p-2"
      trigger={<span className="truncate px-1 text-muted-foreground">{v.text}</span>}
    >
      {(close) => (
        <div className="space-y-2">
          <textarea
            autoFocus
            aria-label={column.name}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setDraft(v.text)}
            rows={5}
            className="w-full resize-y rounded-lg border border-border p-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ type: "LONG_TEXT", text: draft });
                close();
              }}
              className="h-7 rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </PopoverCell>
  );
}

export function NumberCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("NUMBER", value);
  const unit = column.settings.kind === "number" ? column.settings.unit : null;
  const display = v.number === null ? "" : `${v.number.toLocaleString()}${unit ? ` ${unit}` : ""}`;
  const { editing, draft, setDraft, start, finish } = useInlineText(v.number === null ? "" : String(v.number), (text) => {
    const parsed = text.trim() === "" ? null : Number(text);
    if (parsed === null || Number.isFinite(parsed)) onChange({ type: "NUMBER", number: parsed });
  });
  const w = width ?? column.width;
  const align = columnAlign(column.type);
  if (editing) {
    return (
      <CellShell width={w} interactive={false} className="px-0.5">
        <input
          autoFocus
          type="number"
          aria-label={`${column.name} for ${item.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true);
            if (e.key === "Escape") finish(false);
          }}
          className={cn("h-8 w-full rounded-lg border border-ring bg-card px-2 text-[13px] outline-none ring-2 ring-ring/20 tabular", align === "center" ? "text-center" : "text-right")}
        />
      </CellShell>
    );
  }
  return (
    <CellShell
      width={w}
      interactive={!readOnly}
      onClick={readOnly ? undefined : start}
      onKeyDown={(e) => !readOnly && e.key === "Enter" && start()}
      tabIndex={readOnly ? -1 : 0}
      aria-label={`${column.name}: ${display || "empty"} for ${item.name}`}
      align={align}
      className={cn(align === "left" && "justify-end", !readOnly && "cursor-text")}
    >
      <span className="truncate px-1 tabular">{display}</span>
    </CellShell>
  );
}

export function CheckboxCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("CHECKBOX", value);
  return (
    <CellShell width={width ?? column.width} align={columnAlign(column.type)} interactive={!readOnly}>
      <button
        type="button"
        role="checkbox"
        aria-checked={v.checked}
        aria-label={`${column.name} for ${item.name}`}
        disabled={readOnly}
        onClick={() => onChange({ type: "CHECKBOX", checked: !v.checked })}
        className={cn(
          "flex size-4 items-center justify-center rounded-[4px] border transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          v.checked ? "border-green-600 bg-green-600 text-white" : "border-input bg-card hover:border-ring",
        )}
      >
        {v.checked && <Check className="size-3" strokeWidth={3} />}
      </button>
    </CellShell>
  );
}

export function LinkCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("LINK", value);
  const [url, setUrl] = React.useState(v.url);
  const [text, setText] = React.useState(v.text ?? "");
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${v.url || "empty"} for ${item.name}`}
      contentClassName="w-72 p-2"
      trigger={
        v.url ? (
          // The text is not the link: clicking anywhere in the cell edits it,
          // like every other cell, and the icon is what opens the address. With
          // the value centred, an anchor across the middle would swallow the
          // click that opens the editor.
          <span className="flex min-w-0 items-center gap-1 px-1 text-xs text-ring">
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${v.text || v.url}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ExternalLink className="size-3" />
            </a>
            <span className="truncate hover:underline">{v.text || v.url.replace(/^https?:\/\//, "")}</span>
          </span>
        ) : (
          <span className="flex items-center px-1 text-muted-foreground/50">
            <Link2 className="size-3.5" />
          </span>
        )
      }
    >
      {(close) => (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ type: "LINK", url: url.trim(), text: text.trim() || null });
            close();
          }}
        >
          <input
            autoFocus
            aria-label="URL"
            placeholder="https://"
            value={url}
            onFocus={() => {
              setUrl(v.url);
              setText(v.text ?? "");
            }}
            onChange={(e) => setUrl(e.target.value)}
            className="h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <input
            aria-label="Link text"
            placeholder="Display text (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <div className="flex justify-end gap-2">
            {v.url && (
              <button
                type="button"
                onClick={() => {
                  onChange({ type: "LINK", url: "", text: null });
                  close();
                }}
                className="mr-auto h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
              >
                Remove
              </button>
            )}
            <button type="submit" className="h-7 rounded-md bg-foreground px-2.5 text-xs font-medium text-background">
              Save
            </button>
          </div>
        </form>
      )}
    </PopoverCell>
  );
}

export function TagsCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const { model, mutations, openEditLabels } = useBoardContext();
  const v = valueOf("TAGS", value);
  const options = React.useMemo(() => tagOptionsFor(column, model.snapshot.values), [column, model.snapshot.values]);
  const visibleTags = fitChips(v.tags.map(formatTag), width ?? column.width);
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${v.tags.map(formatTag).join(", ") || "none"} for ${item.name}`}
      contentClassName="w-64 p-2"
      trigger={
        <span className="flex items-center gap-1 overflow-hidden px-1.5">
          {v.tags.slice(0, visibleTags).map((tag) => (
            <span key={tag} className={cn("min-w-0 shrink-0 truncate rounded-md px-2 py-0.5 text-2xs font-medium", colorClasses(tagColor(options, tag)).soft)}>
              {formatTag(tag)}
            </span>
          ))}
          {v.tags.length > visibleTags && <MoreCount count={v.tags.length - visibleTags} />}
        </span>
      }
    >
      {() => (
        <TagsEditor
          value={v.tags}
          options={options}
          onChange={(tags) => onChange({ type: "TAGS", tags })}
          onCreate={(raw) => {
            // A tag created here joins the column's palette, so the next item can reuse it.
            const name = normalizeTagName(raw);
            if (!name || v.tags.includes(name)) return;
            if (!columnTagOptions(column).some((o) => o.name.toLowerCase() === name.toLowerCase())) {
              void mutations.updateColumnTags(column.id, [...columnTagOptions(column), { name, color: tagColorFor(name) }], {});
            }
            onChange({ type: "TAGS", tags: [...v.tags, name] });
          }}
          onEditTags={() => openEditLabels(column)}
        />
      )}
    </PopoverCell>
  );
}

/**
 * Who the work is for: one of the workspace's stakeholder groups (Settings →
 * Lists), the same list on every board that asks.
 *
 * Deliberately unlike the other chips. A tag or a status is a filled pill; this
 * is a small outline over a wash of the group's colour, with the colour again as
 * a dot in front — a stakeholder is not a state of the work, it is who is
 * waiting for it, so it reads as a name rather than as another badge.
 */
export function StakeholderCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const ws = useWorkspace();
  const groups = useWorkspaceList(ws.workspace.id, "STAKEHOLDER_GROUPS");
  const v = valueOf("STAKEHOLDER", value);
  const chosen = groups.find((g) => g.name.toLowerCase() === (v.group ?? "").toLowerCase());
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${v.group ?? "not set"} for ${item.name}`}
      contentClassName="w-56 p-1"
      trigger={
        <span className="flex items-center gap-1.5 overflow-hidden px-1.5">
          {v.group ? (
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-1 rounded border border-border/60 py-px pr-1.5 pl-1 text-[10px] font-medium tracking-wide uppercase",
                colorClasses(chosen?.color ?? tagColorFor(v.group)).soft,
              )}
            >
              <span className={cn("size-1 shrink-0 rounded-full", colorClasses(chosen?.color ?? tagColorFor(v.group)).dot)} />
              <span className="truncate">{v.group}</span>
            </span>
          ) : null}
        </span>
      }
    >
      {(close) => (
        <div role="listbox" aria-label={column.name}>
          {groups.map((group) => {
            const active = group.name.toLowerCase() === (v.group ?? "").toLowerCase();
            return (
              <button
                key={group.name}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange({ type: "STAKEHOLDER", group: active ? null : group.name });
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                data-testid={`stakeholder-option-${group.name}`}
              >
                <span className={cn("size-2 shrink-0 rounded-full", colorClasses(group.color).dot)} />
                <span className="min-w-0 flex-1 truncate">{group.name}</span>
                {active && <Check className="size-3.5 shrink-0" />}
              </button>
            );
          })}
          {groups.length === 0 && <p className="px-2 py-3 text-center text-2xs text-muted-foreground">No stakeholder groups yet. Add them in Settings → Lists.</p>}
          {v.group && (
            <button
              type="button"
              onClick={() => {
                onChange({ type: "STAKEHOLDER", group: null });
                close();
              }}
              className="mt-1 flex w-full items-center gap-2 border-t border-border/60 px-2 py-1.5 text-left text-2xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </PopoverCell>
  );
}

export function DependencyCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const { model } = useBoardContext();
  const v = valueOf("DEPENDENCY", value);
  const deps = v.itemIds.map((id) => model.itemById.get(id)).filter((i): i is Item => !!i);
  const blocked = model.isBlocked(item.id);
  const names = deps.map((d) => d.name);
  // Names run together as text rather than chips, so the alarm icon is the only extra width.
  const visibleDeps = fitChips(names, (width ?? column.width) - (blocked ? 18 : 0));
  return (
    <PopoverCell
      width={width ?? column.width}
      disabled={readOnly}
      align={columnAlign(column.type)}
      ariaLabel={`${column.name}: ${deps.map((d) => d.name).join(", ") || "none"} for ${item.name}`}
      contentClassName="w-72 p-0"
      trigger={
        deps.length > 0 ? (
          <span className={cn("flex items-center gap-1 overflow-hidden px-1 text-xs", blocked ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {blocked && <TriangleAlert className="size-3 shrink-0" />}
            <span className="truncate">{names.slice(0, visibleDeps).join(", ")}</span>
            {names.length > visibleDeps && <MoreCount count={names.length - visibleDeps} />}
          </span>
        ) : (
          <span className="px-1 text-2xs text-muted-foreground/60">—</span>
        )
      }
    >
      {() => (
        <DependencyPicker
          items={model.snapshot.items.filter((i) => i.id !== item.id && i.parentItemId === null)}
          value={v.itemIds}
          isDone={model.isDone}
          onChange={(itemIds) => onChange({ type: "DEPENDENCY", itemIds })}
        />
      )}
    </PopoverCell>
  );
}
