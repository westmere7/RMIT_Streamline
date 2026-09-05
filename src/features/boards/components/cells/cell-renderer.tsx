"use client";

import { Check, ExternalLink, Link2, Paperclip, TriangleAlert } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { BoardColumn, ColumnValue, ColumnValueOf, Item } from "@/domain";
import { columnLabels, columnTagOptions, emptyValueFor, isStuckLabel, statusRoleIds } from "@/domain";
import { LabelPicker } from "@/features/boards/components/pickers/label-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { DatePicker, TimelinePicker } from "@/features/boards/components/pickers/date-picker";
import { DependencyPicker } from "@/features/boards/components/pickers/dependency-picker";
import { TagsEditor } from "@/features/boards/components/pickers/tags-editor";
import { useBoardContext } from "@/features/boards/board-context";
import { columnAlign } from "@/features/boards/board-model";
import { formatTag, normalizeTagName, tagColor, tagOptionsFor } from "@/features/boards/tag-palette";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatDateRange, formatShortDate, isOverdue, isToday } from "@/lib/dates/dates";
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
    case "FILES":
      return <FilesCell {...props} />;
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

// ---- Status / Priority -----------------------------------------------------

export function StatusCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const { openEditLabels } = useBoardContext();
  const v = valueOf("STATUS", value);
  const labels = columnLabels(column);
  const label = labels.find((l) => l.id === v.labelId) ?? null;
  const stuck = isStuckLabel(column, v.labelId);
  const w = width ?? column.width;
  return (
    <PopoverCell
      width={w}
      disabled={readOnly}
      ariaLabel={`${column.name}: ${label?.name ?? "not set"} for ${item.name}`}
      testId="status-cell"
      align="center"
      contentClassName="p-2"
      trigger={
        label ? (
          <span className="flex h-full w-full items-center p-1.5">
            <span className={cn("flex h-full w-full items-center justify-center truncate rounded-lg text-xs font-medium shadow-xs", colorClasses(label.color).solid, stuck && "zebra")}>
              <span className="truncate px-2">{label.name}</span>
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
  const { openEditLabels } = useBoardContext();
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
      trigger={<LabelPill label={label} appearance="soft" size="sm" emptyText="" className="mx-1" />}
    >
      {(close) => (
        <LabelPicker
          labels={labels}
          value={v.labelId}
          appearance="soft"
          onChange={(labelId) => {
            onChange({ type: "PRIORITY", labelId });
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
      align="center"
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
      align="center"
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
      align="center"
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
          className="h-8 w-full rounded-lg border border-ring bg-card px-2 text-[13px] outline-none ring-2 ring-ring/20"
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
          className="h-8 w-full rounded-lg border border-ring bg-card px-2 text-right text-[13px] outline-none ring-2 ring-ring/20 tabular"
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
      className={cn("justify-end", !readOnly && "cursor-text")}
    >
      <span className="truncate px-1 tabular">{display}</span>
    </CellShell>
  );
}

export function CheckboxCell({ item, column, value, onChange, readOnly, width }: CellProps) {
  const v = valueOf("CHECKBOX", value);
  return (
    <CellShell width={width ?? column.width} align="center" interactive={!readOnly}>
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
      ariaLabel={`${column.name}: ${v.url || "empty"} for ${item.name}`}
      contentClassName="w-72 p-2"
      trigger={
        v.url ? (
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 truncate px-1 text-xs text-ring hover:underline"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{v.text || v.url.replace(/^https?:\/\//, "")}</span>
          </a>
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

export function FilesCell({ item, column, value, readOnly, width }: CellProps) {
  const v = valueOf("FILES", value);
  const { openItem } = useBoardContext();
  return (
    <CellShell width={width ?? column.width} align="center" interactive={!readOnly}>
      {v.files.length > 0 ? (
        <SimpleTooltip label={v.files.map((f) => f.filename).join(", ")}>
          <button type="button" onClick={() => openItem(item.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Paperclip className="size-3.5" />
            {v.files.length}
          </button>
        </SimpleTooltip>
      ) : (
        <button type="button" aria-label={`Add files to ${item.name}`} onClick={() => openItem(item.id)} className="text-muted-foreground/40 hover:text-foreground">
          <Paperclip className="size-3.5" />
        </button>
      )}
    </CellShell>
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
