"use client";

import { CalendarDays, Check, ChevronRight, Copy, FileText, FolderInput, FolderOutput, Hash, Layers, Link2, Minus, MoreVertical, Pencil, Plus, Tag, Trash2, TriangleAlert, Ungroup, UserRound } from "lucide-react";
import * as React from "react";
import { type MenuAction, renderDropdown, useMenuFocusGuard } from "@/components/layout/row-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ColorDot, LabelPill } from "@/components/shared/label-pill";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AssetLink, TagOption, User } from "@/domain";
import { ASSET_TYPE_OPTIONS, assetCount, groupAssetBlocks } from "@/domain";
import { AssetBlockDialog, type AssetBlockForm } from "@/features/assets/asset-block-dialog";
import { cleanDraftLinks, LinksEditor, linkMenuActions, sameLinks } from "@/features/assets/asset-links";
import { DatePicker } from "@/features/boards/components/pickers/date-picker";
import { PersonPicker } from "@/features/boards/components/pickers/person-picker";
import { assetTypeLabel } from "@/features/items/item-assets-recap";
import { daysUntil, formatShortDate, isOverdue } from "@/lib/dates/dates";
import { nowIso } from "@/lib/ids";
import { cn } from "@/lib/utils";

/**
 * One deliverable as the composer holds it. The same shape whether it is saved
 * (an item's asset row) or still being typed (a booking that has not been sent),
 * so both places edit it with the same controls.
 */
export interface AssetComposerRow {
  id: string;
  name: string;
  assetType: string | null;
  quantity: number | null;
  assigneeIds: string[];
  dueDate: string | null;
  notes: string | null;
  /** Previews, final artwork, folders… in the order they are listed. */
  links: AssetLink[];
  /** The block the line sits in, if any. */
  blockId: string | null;
  blockName: string | null;
  /** The block's own links, the same on each of its lines. */
  blockLinks: AssetLink[];
  completedAt: string | null;
}

export type AssetComposerPatch = Partial<Omit<AssetComposerRow, "id">>;

/**
 * Which details this composer offers. Name, quantity and spec are always there;
 * the rest depend on where it stands — a stakeholder booking work has nobody to
 * put in charge and nothing to tick off yet.
 */
export interface AssetComposerFields {
  done?: boolean;
  type?: boolean;
  people?: boolean;
  due?: boolean;
  /** The links. Off where nobody has any yet. */
  links?: boolean;
  /** Blocks: several lines under one name and one person in charge. */
  blocks?: boolean;
}

const ALL_FIELDS: Required<AssetComposerFields> = { done: true, type: true, people: true, due: true, links: true, blocks: true };

/** Where a line added inside a block goes, and who it is on. */
export interface AssetBlockTarget {
  blockId: string;
  blockName: string;
  assigneeIds: string[];
  blockLinks: AssetLink[];
}

export interface AssetBlockPatch {
  name?: string;
  assigneeIds?: string[];
  links?: AssetLink[];
  ungroup?: boolean;
}

/**
 * The asset composer: a list of deliverables, one row each, with a box above it
 * for the next one.
 *
 * A row is a single line until you open it — a tick, its number, its name and
 * the short version of its details — because reading the list is the common act
 * and editing one of them is the rare one. Opening one turns those details into
 * the pickers that set them.
 *
 * An open row is a draft: the pickers change what is on screen and nothing else
 * until Update saves it, and Discard puts it back. Ticking one off and renaming
 * it are not part of that draft — they land at once, the way they read.
 *
 * It is built for a 520px panel, so nothing relies on width: every row truncates
 * and the chips wrap.
 */
export function AssetComposer({
  rows,
  fields,
  assetTypes = ASSET_TYPE_OPTIONS,
  users = [],
  canEdit = true,
  disabled = false,
  addPlaceholder = "Add an item, e.g. A1 poster",
  emptyText,
  addable = true,
  actions,
  numbers: numberOverride,
  detailed = false,
  onAdd,
  onAddBlock,
  onPatchBlock,
  onSaveBlock,
  onRemoveBlock,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  rows: readonly AssetComposerRow[];
  fields?: AssetComposerFields;
  /** The workspace's asset types (Settings → Asset types). Needed only when `fields.type` is on. */
  assetTypes?: readonly TagOption[];
  /** Needed only when `fields.people` is on. */
  users?: User[];
  canEdit?: boolean;
  /** Shown but inert — the form editor's preview. */
  disabled?: boolean;
  addPlaceholder?: string;
  emptyText?: string;
  /** False leaves out the boxes for adding lines, for a view of part of a list. */
  addable?: boolean;
  /** More buttons beside Block, or on a row of their own when nothing can be added. */
  actions?: React.ReactNode;
  /** Line numbers from a longer list this view is part of, so a line keeps its number. */
  numbers?: ReadonlyMap<string, number>;
  /** Closed rows spell out what they have — quantity, type, due and how far off, spec, links — on a line under the name. */
  detailed?: boolean;
  /** A new line: on its own, or at the end of a block. */
  onAdd: (name: string, block?: AssetBlockTarget) => void;
  onAddBlock?: (block: AssetBlockForm) => void;
  onPatchBlock?: (blockId: string, patch: AssetBlockPatch) => void;
  /** Everything the block dialog changed. Without it a block cannot be reopened in the dialog. */
  onSaveBlock?: (blockId: string, block: AssetBlockForm) => void;
  onRemoveBlock?: (blockId: string) => void;
  onPatch: (id: string, patch: AssetComposerPatch) => void;
  onDuplicate: (row: AssetComposerRow) => void;
  onRemove: (id: string) => void;
}) {
  const on = { ...ALL_FIELDS, ...fields };
  const blocksOn = on.blocks && !!onAddBlock && !!onPatchBlock && !!onRemoveBlock;
  const [newName, setNewName] = React.useState("");
  const [blockDialog, setBlockDialog] = React.useState(false);
  const entries = React.useMemo(() => (blocksOn ? groupAssetBlocks(rows) : rows.map((line) => ({ kind: "line" as const, line }))), [rows, blocksOn]);
  const blocks = React.useMemo(
    () => entries.flatMap((entry) => (entry.kind === "block" ? [blockTarget(entry.blockId, entry.name, entry.lines)] : [])),
    [entries],
  );
  // Which of them are open. One added just now opens itself, since the next
  // thing anyone does is fill in its details.
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [justAdded, setJustAdded] = React.useState<string | null>(null);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setJustAdded(name);
    setNewName("");
  };

  const addInto = (block: AssetBlockTarget, name: string) => {
    onAdd(name, block);
    setJustAdded(name);
  };

  // Lines are numbered down the whole list, blocks included.
  const ownNumbers = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) for (const line of entry.kind === "line" ? [entry.line] : entry.lines) map.set(line.id, map.size + 1);
    return map;
  }, [entries]);
  const numbers = numberOverride ?? ownNumbers;
  const adding = canEdit && addable;
  const lineCard = (row: AssetComposerRow, inBlock: boolean) => {
    return (
      <AssetRowCard
        key={row.id}
        row={row}
        number={numbers.get(row.id) ?? 0}
        fields={inBlock ? { ...on, people: false } : on}
        assetTypes={assetTypes}
        users={users}
        canEdit={canEdit && !disabled}
        open={open.has(row.id) || row.name === justAdded}
        onToggle={() => {
          if (row.name === justAdded) setJustAdded(null);
          else toggle(row.id);
        }}
        onChange={(patch) => onPatch(row.id, patch)}
        onDuplicate={() => onDuplicate(row)}
        onRemove={() => onRemove(row.id)}
        blocks={blocksOn && !inBlock ? blocks : undefined}
        inBlock={blocksOn && inBlock}
        detailed={detailed}
        // Level with the lines inside a block, whose box insets them.
        inset={!inBlock && blocks.length > 0}
      />
    );
  };

  return (
    // Laid out against its own width rather than the window's: the same list sits
    // in a 300px task panel, half of the wide one, a booking form and a phone. Under 28rem a
    // row keeps its name to itself and puts its details on a second line.
    <div className="@container/assets">
      {/* ---- Add one. Above the list: it stays put however long the list gets. */}
      {/* Not a <form>: the booking page already is one, and a form inside a form
          is invalid — Enter is handled on the field instead. */}
      {adding && (
        <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 shadow-xs focus-within:ring-2 focus-within:ring-ring">
          <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
            placeholder={addPlaceholder}
            aria-label="Add an asset item"
            disabled={disabled}
            data-testid="asset-add-input"
            className="h-8 min-w-0 flex-1 truncate bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
          <Button type="button" onClick={add} size="sm" className="h-7 shrink-0" disabled={disabled || !newName.trim()} data-testid="asset-add-submit">
            Add
          </Button>
        </div>
          {/* The other way in, beside the field rather than in it: several
              things, one person, each due on its own day. */}
          {blocksOn && (
            <Button type="button" onClick={() => setBlockDialog(true)} variant="outline" className="h-auto shrink-0 self-stretch rounded-xl px-3 shadow-xs" disabled={disabled} title="Several items for one person" data-testid="asset-add-block">
              <Layers /> Block
            </Button>
          )}
          {actions}
        </div>
      )}
      {!adding && actions && <div className="flex h-9 items-stretch justify-end gap-2">{actions}</div>}
      {blocksOn && canEdit && (
        <AssetBlockDialog
          open={blockDialog}
          onOpenChange={(next) => {
            setBlockDialog(next);
            if (!next) setNewName("");
          }}
          initialName={newName.trim()}
          assetTypes={assetTypes}
          users={users}
          onSubmit={(block) => onAddBlock!(block)}
        />
      )}

      <ul className={cn("space-y-1.5", (adding || actions) && "mt-2")} data-testid="asset-lines">
        {entries.map((entry) =>
          entry.kind === "line" ? (
            lineCard(entry.line, false)
          ) : (
            <AssetBlockCard
              key={entry.blockId}
              name={entry.name}
              lines={entry.lines}
              fields={on}
              assetTypes={assetTypes}
              users={users}
              canEdit={canEdit && !disabled}
              addable={addable}
              onAdd={(name) => addInto(blockTarget(entry.blockId, entry.name, entry.lines), name)}
              onPatch={(patch) => onPatchBlock!(entry.blockId, patch)}
              onSave={onSaveBlock ? (block) => onSaveBlock(entry.blockId, block) : undefined}
              onRemove={() => onRemoveBlock!(entry.blockId)}
            >
              {entry.lines.map((line) => lineCard(line, true))}
            </AssetBlockCard>
          ),
        )}
        {rows.length === 0 && emptyText && (
          <li className="rounded-xl border border-dashed border-border/80 px-4 py-4 text-center text-[13px] text-muted-foreground" data-testid="assets-empty">
            {emptyText}
          </li>
        )}
      </ul>
    </div>
  );
}

/** The part of a row an open form edits. Everything else about it saves as it is touched. */
interface AssetDraft {
  assetType: string | null;
  assigneeIds: string[];
  quantity: number | null;
  dueDate: string | null;
  notes: string | null;
  links: AssetLink[];
}

function draftOf(row: AssetComposerRow): AssetDraft {
  return { assetType: row.assetType, assigneeIds: row.assigneeIds, quantity: row.quantity, dueDate: row.dueDate, notes: row.notes, links: row.links };
}

/** Only what the draft actually changed, so Update writes nothing it does not have to. */
function draftPatch(row: AssetComposerRow, draft: AssetDraft): AssetComposerPatch {
  const patch: AssetComposerPatch = {};
  if (draft.assetType !== row.assetType) patch.assetType = draft.assetType;
  if (draft.quantity !== row.quantity) patch.quantity = draft.quantity;
  if (draft.dueDate !== row.dueDate) patch.dueDate = draft.dueDate;
  if (draft.notes !== row.notes) patch.notes = draft.notes;
  // Links with nothing in the address are not links; an empty one left in the
  // editor is not a change.
  const links = cleanDraftLinks(draft.links);
  if (!sameLinks(links, row.links)) patch.links = links;
  if (draft.assigneeIds.length !== row.assigneeIds.length || draft.assigneeIds.some((id, i) => id !== row.assigneeIds[i])) patch.assigneeIds = draft.assigneeIds;
  return patch;
}

/** The quiet icon buttons at the end of a closed row. Always there: a control that only appears under a pointer is a control no finger ever finds. */
const rowActionClass = "shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

/** A control in an open row's little form. Full width, so the fields line up in columns. */
const fieldClass =
  "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent";

/** Long enough to tell a double click from two single ones, short enough that opening a row still feels immediate. */
const DOUBLE_CLICK_MS = 220;

/**
 * One deliverable. Closed, it is a single row: done, number, name, and the same
 * details as a quiet summary. Open, those details become a small form — labelled
 * fields in two columns with the spec across the foot — so the controls line up
 * with each other and down the list.
 *
 * Clicking the row opens and closes it, whether it is open or not; renaming is a
 * double click (or the menu, which is also where the keyboard finds it), so
 * reading a row and editing its name never fight over the same click.
 */
function AssetRowCard({
  row,
  number,
  fields,
  assetTypes,
  users,
  canEdit,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
  blocks,
  inBlock = false,
  inset = false,
  detailed = false,
}: {
  row: AssetComposerRow;
  number: number;
  fields: Required<AssetComposerFields>;
  assetTypes: readonly TagOption[];
  users: User[];
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: AssetComposerPatch) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** The list's blocks, which a line on its own can be moved into. */
  blocks?: readonly AssetBlockTarget[];
  /** In a block: the line can be taken out of it, and its people are the block's. */
  inBlock?: boolean;
  /** Set in by a block's border and padding, so a line on its own lines up with the lines in a block. */
  inset?: boolean;
  detailed?: boolean;
}) {
  // What the open form is holding. It starts from the row each time the row is
  // opened, so Discard is simply "close it again".
  const [draft, setDraft] = React.useState<AssetDraft>(() => draftOf(row));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(draftOf(row));
  }
  const edit = (patch: Partial<AssetDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const patch = draftPatch(row, draft);
  const dirty = Object.keys(patch).length > 0;
  /**
   * Whether a field in the open form has the cursor.
   *
   * Update is disabled while there is nothing to save — but two of the fields
   * in here only commit what is typed when they lose focus, so "nothing to
   * save" can be false and about to become true. A disabled button swallows
   * the click that would have blurred the field, and the first press then
   * appears to do nothing. While the cursor is in the form the button stays
   * live and that click does its work.
   */
  const [typing, setTyping] = React.useState(false);

  // Closed, the row reads what is saved; open, it reads the draft.
  const shown = open ? { ...row, ...draft } : row;
  const assignees = shown.assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const done = row.completedAt !== null;
  const overdue = !done && isOverdue(shown.dueDate);
  const typeLabel = assetTypeLabel(shown.assetType, assetTypes);
  const count = assetCount(shown);
  const inCharge = assignees.length === 0 ? "Not set" : assignees.length === 1 ? assignees[0]!.firstName : `${assignees.length} people`;
  // What the closed row shows on its right: who it is on and when it is due.
  // The links are in the menu, however many there are.
  const showPeople = fields.people && assignees.length > 0;
  const showDue = fields.due && !!shown.dueDate;
  const [renaming, setRenaming] = React.useState(false);
  const [dueOpen, setDueOpen] = React.useState(false);
  // Rename opens a field, so it waits for the menu to finish closing rather than
  // mounting inside a focus trap on its way out.
  const menuFocus = useMenuFocusGuard();
  // The first click of a double click has to be held back, or a rename would
  // open (or close) the row on its way through.
  const pending = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  const click = () => {
    if (renaming || pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      onToggle();
    }, DOUBLE_CLICK_MS);
  };

  const save = () => {
    if (dirty) onChange(patch);
    onToggle();
  };

  const discard = () => {
    setDraft(draftOf(row));
    onToggle();
  };

  const rename = () => {
    if (!canEdit) return;
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    setRenaming(true);
  };

  // Everything that changes the row rather than says something about it. Off the
  // line, where it is not competing with the type or the date, but always one
  // tap away rather than one hover.
  const linkActions = fields.links ? linkMenuActions(row.links) : [];
  const menuActions: MenuAction[] = [
    ...linkActions,
    ...(canEdit
      ? ([
          ...(linkActions.length ? [{ type: "separator" as const }] : []),
          { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => menuFocus.run(() => setRenaming(true)), testId: "asset-rename" },
          { type: "item", label: "Duplicate", icon: <Copy />, onSelect: onDuplicate, testId: "asset-duplicate" },
          ...(inBlock
            ? [{ type: "item" as const, label: "Take out of block", icon: <FolderOutput />, onSelect: () => onChange({ blockId: null, blockName: null, blockLinks: [] }), testId: "asset-leave-block" }]
            : blocks && blocks.length > 0
              ? [
                  {
                    type: "sub" as const,
                    label: "Move to block",
                    icon: <FolderInput />,
                    items: blocks.map((block) => ({
                      type: "item" as const,
                      label: block.blockName,
                      icon: <Layers />,
                      // Into the block and onto its people: a block is one person's.
                      onSelect: () => onChange({ blockId: block.blockId, blockName: block.blockName, assigneeIds: block.assigneeIds, blockLinks: block.blockLinks }),
                      testId: "asset-move-to-block",
                    })),
                  },
                ]
              : []),
          { type: "separator" },
          { type: "item", label: "Remove", icon: <Trash2 />, destructive: true, onSelect: onRemove, testId: "asset-menu-remove" },
        ] satisfies MenuAction[])
      : []),
  ];

  return (
    <li className={cn("flex items-stretch gap-1.5", inset && "px-[calc(0.375rem+1px)]")} data-testid="asset-line" data-asset-name={row.name} data-asset-done={done ? "true" : "false"}>
      {/* The count is about the list, not about the deliverable, so it is kept
          out of the card and set in the margin the list reads down. */}
      <span className="w-4 shrink-0 pt-3.5 pr-0.5 text-right text-2xs font-medium tabular text-muted-foreground/60 @max-[28rem]/assets:hidden" aria-hidden data-testid="asset-number">
        {number}
      </span>

      {/* The row's standing as a straight line the height of the card, so the
          shape of a long list reads down the margin before anyone reads a date:
          green for done, red for late, and a neutral rail for the rest — which
          is a rail rather than nothing, so the column is unbroken. */}
      <span aria-hidden className={cn("w-1 shrink-0 transition-colors", done ? "bg-emerald-500" : overdue ? "bg-red-500" : "bg-muted-foreground/30")} data-testid="asset-standing" />

      <div
        className={cn(
          "min-w-0 flex-1 rounded-xl border border-border/70 bg-card shadow-xs transition-colors",
          !open && "hover:bg-accent/40",
          done && "bg-card/60",
          open && "border-border ring-1 ring-border/60",
        )}
      >
        {/* ---- The row you read -------------------------------------------- */}
        <div className="flex items-center gap-2 px-2.5 py-2">
          {fields.done && (
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? `Mark ${row.name} as not done` : `Mark ${row.name} as done`}
              disabled={!canEdit}
              onClick={() => onChange({ completedAt: done ? null : nowIso() })}
              data-testid="asset-done"
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border/80 hover:border-ring",
                !canEdit && "cursor-default opacity-70",
              )}
            >
              {done && <Check className="size-3" strokeWidth={3} />}
            </button>
          )}

          {/* Name and summary together: one target, so a click anywhere along the row opens it. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 select-none" onClick={click} onDoubleClick={rename}>
            {renaming && canEdit ? (
              <TextField
                value={row.name}
                placeholder="Asset"
                ariaLabel={`Asset name: ${row.name}`}
                canEdit
                autoFocus
                onCommit={(name) => name.trim() && name !== row.name && onChange({ name: name.trim() })}
                onDone={() => setRenaming(false)}
                testId="asset-name"
                className="min-w-0 flex-1 font-medium"
              />
            ) : (
              <button
                type="button"
                aria-expanded={open}
                title={canEdit ? "Click to open, double click to rename" : undefined}
                className="min-w-[3.5rem] flex-1 truncate rounded-md py-1 text-left text-[13px] font-medium"
                data-testid="asset-name"
              >
                <span className={cn(done && "text-muted-foreground line-through")}>{row.name}</span>
              </button>
            )}

            {/* What the deliverable is, against its name: how many, and of what. */}
            {!open && !renaming && !detailed && (
              <span className="flex min-w-0 shrink items-center gap-1 text-2xs text-muted-foreground @max-[28rem]/assets:hidden" data-testid="asset-summary">
                {/* A count only when there is more than one: "×1" down every row
                    of the list is a column of noise. */}
                {count > 1 && <span className="rounded bg-muted/70 px-1 py-px text-[10px] font-medium tabular text-muted-foreground">×{count}</span>}
                {fields.type && typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" className="h-5 max-w-28 px-1.5 text-[10px]" />}
              </span>
            )}
          </div>

          {/* Who it is on and when it is due: the two things worth knowing about
              a deliverable nobody has opened. No calendar icon against the date —
              a date already looks like one — and a warning only once it has gone
              by. */}
          {!open && !renaming && !detailed && (showPeople || showDue) && (
            <div className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground @max-[28rem]/assets:hidden" data-testid="asset-meta">
              {showPeople && (
                <span className="flex -space-x-1">
                  {assignees.slice(0, 3).map((u) => (
                    <UserAvatar key={u.id} user={u} size="xs" tooltip={false} className="size-4.5 text-[8px] ring-1" />
                  ))}
                </span>
              )}
              {showDue && (
                <span className={cn("flex items-center gap-1 tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>
                  {overdue && <TriangleAlert className="size-2.5 shrink-0" />}
                  {formatShortDate(shown.dueDate)}
                </span>
              )}
            </div>
          )}

          {/* Everything else behind a "…", links included. It sits on the row at
              rest: a control that only exists under a pointer is a control a
              touchscreen never offers. */}
          <div className="flex shrink-0 items-center gap-0.5 pl-1.5">
            {menuActions.length > 0 && !renaming && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`Options for ${row.name}`} title="More" data-testid="asset-menu" className={rowActionClass}>
                    <MoreVertical className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
                  {renderDropdown(menuActions)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* The chevron stays out of the menu: it is not an action but the
                row's state, and it has to be readable without opening anything. */}
            <button type="button" onClick={onToggle} aria-expanded={open} aria-label={open ? `Close ${row.name}` : `Open ${row.name}`} data-testid="asset-toggle" className={rowActionClass}>
              <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            </button>
          </div>
        </div>

        {/* ---- Narrow: the same details, on a line of their own under the name.
            Squeezed onto the name's line they ran into it and each other. */}
        {!open && !renaming && !detailed && (count > 1 || (fields.type && typeLabel) || showPeople || showDue) && (
          <div className={cn("hidden flex-wrap items-center gap-x-2 gap-y-1 pr-2.5 pb-2 text-2xs text-muted-foreground @max-[28rem]/assets:flex", fields.done ? "pl-[2.125rem]" : "pl-2.5")} data-testid="asset-summary-compact">
            {count > 1 && <span className="rounded bg-muted/70 px-1 py-px text-[10px] font-medium tabular">×{count}</span>}
            {fields.type && typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" className="h-5 max-w-32 px-1.5 text-[10px]" />}
            {showPeople && (
              <span className="flex -space-x-1">
                {assignees.slice(0, 3).map((u) => (
                  <UserAvatar key={u.id} user={u} size="xs" tooltip={false} className="size-4.5 text-[8px] ring-1" />
                ))}
              </span>
            )}
            {showDue && (
              <span className={cn("flex items-center gap-1 tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>
                {overdue && <TriangleAlert className="size-2.5 shrink-0" />}
                {formatShortDate(shown.dueDate)}
              </span>
            )}
          </div>
        )}

        {/* ---- Detailed: everything the line has, and nothing it does not. */}
        {!open && !renaming && detailed && <AssetDetailLine row={row} typeLabel={fields.type ? typeLabel : null} done={done} overdue={overdue} indent={fields.done} />}

        {/* ---- The row you edit: the fields in two columns, spec across the foot. */}
        {open && (
          <div
            className="grid grid-cols-2 gap-x-2.5 gap-y-2 border-t border-border/60 px-2.5 pt-2.5 pb-2.5 @max-[28rem]/assets:grid-cols-1"
            onFocusCapture={() => setTyping(true)}
            onBlurCapture={(event) => setTyping(event.currentTarget.contains(event.relatedTarget as Node | null))}
            data-testid="asset-details"
          >
            {fields.type && (
              <Detail label="Type">
                <Popover>
                  <PopoverTrigger asChild disabled={!canEdit}>
                    <button type="button" className={fieldClass} aria-label={`Asset type: ${draft.assetType ?? "not set"}`} data-testid="asset-type">
                      {typeLabel ? (
                        <LabelPill label={typeLabel} appearance="soft" size="sm" />
                      ) : (
                        <>
                          <Tag className="size-3 shrink-0 opacity-60" />
                          <span className="truncate text-muted-foreground/80">Not set</span>
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2">
                    <p className="mb-1.5 label-quiet">Asset type</p>
                    {/* A column that scrolls rather than a block that wraps: a
                        workspace with twenty-odd types wrapped into pills is a
                        wall to search, and it grows the popover until it runs
                        off the screen. Capped, one a line, in the list's own
                        order — which is the order people know them in. */}
                    <div className="scrollbar-thin -mr-1 grid max-h-64 gap-0.5 overflow-y-auto pr-1">
                      {assetTypes.map((option) => {
                        const active = draft.assetType?.toLowerCase() === option.name.toLowerCase();
                        return (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => edit({ assetType: active ? null : option.name })}
                            className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent", active && "bg-accent font-medium")}
                            aria-pressed={active}
                            data-testid={`asset-type-option-${option.name}`}
                          >
                            <ColorDot color={option.color} className="size-2" />
                            <span className="min-w-0 flex-1 truncate">{option.name}</span>
                            {active && <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      defaultValue={draft.assetType && !assetTypes.some((o) => o.name.toLowerCase() === draft.assetType!.toLowerCase()) ? draft.assetType : ""}
                      placeholder="Or type another and press Enter"
                      aria-label="Custom asset type"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          edit({ assetType: (e.target as HTMLInputElement).value.trim() || null });
                        }
                      }}
                      className="mt-2 h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </PopoverContent>
                </Popover>
              </Detail>
            )}

            {/* Who is in charge. A row can take more than one person. */}
            {fields.people && (
              <Detail label="In charge">
                <Popover>
                  <PopoverTrigger asChild disabled={!canEdit}>
                    <button
                      type="button"
                      className={fieldClass}
                      aria-label={`In charge: ${assignees.length > 0 ? assignees.map((u) => u.displayName).join(", ") : "nobody"}`}
                      data-testid="asset-assignee"
                    >
                      {assignees.length > 0 ? (
                        <span className="flex shrink-0 -space-x-1">
                          {assignees.slice(0, 3).map((u) => (
                            <UserAvatar key={u.id} user={u} size="xs" tooltip={false} />
                          ))}
                        </span>
                      ) : (
                        <UserRound className="size-3 shrink-0 opacity-60" />
                      )}
                      <span className={cn("truncate", assignees.length === 0 && "text-muted-foreground/80")}>{inCharge}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0">
                    <PersonPicker users={users} value={draft.assigneeIds} onChange={(ids) => edit({ assigneeIds: ids })} />
                  </PopoverContent>
                </Popover>
              </Detail>
            )}

            {/* Quantity: a stepper, because most edits are ±1 */}
            <Detail label="Quantity">
              <QuantityChip value={draft.quantity} canEdit={canEdit} onChange={(quantity) => edit({ quantity })} />
            </Detail>

            {fields.due && (
              <Detail label="Due">
                <Popover open={dueOpen} onOpenChange={setDueOpen}>
                  <PopoverTrigger asChild disabled={!canEdit}>
                    <button
                      type="button"
                      className={cn(fieldClass, "tabular", overdue && "border-red-300 text-red-700 dark:border-red-500/50 dark:text-red-300")}
                      aria-label={`Due: ${draft.dueDate ? formatShortDate(draft.dueDate) : "not set"}`}
                      data-testid="asset-due"
                    >
                      {overdue ? <TriangleAlert className="size-3 shrink-0" /> : <CalendarDays className="size-3 shrink-0 opacity-60" />}
                      <span className={cn("truncate", !draft.dueDate && "text-muted-foreground/80")}>{draft.dueDate ? formatShortDate(draft.dueDate) : "Not set"}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <DatePicker value={draft.dueDate} onChange={(dueDate) => edit({ dueDate })} onDone={() => setDueOpen(false)} />
                  </PopoverContent>
                </Popover>
              </Detail>
            )}

            <Detail label="Specs / notes" stacked className={cn("col-span-2 @max-[28rem]/assets:col-span-1", !canEdit && !draft.notes && "hidden")}>
              <TextField
                value={draft.notes ?? ""}
                placeholder={canEdit ? "Size, format, finish…" : ""}
                ariaLabel={`Notes: ${draft.notes ?? "none"}`}
                canEdit={canEdit}
                onCommit={(notes) => edit({ notes: notes.trim() || null })}
                testId="asset-notes"
                className="h-8 w-full min-w-0 rounded-lg border border-border/70 px-2 text-xs"
              />
            </Detail>

            {/* As many links as it needs, each with its own label and icon, in the
                order they are listed here — which is the order the menu shows. */}
            {fields.links && (canEdit || draft.links.length > 0) && (
              <Detail label="Links" stacked className="col-span-2 @max-[28rem]/assets:col-span-1">
                <LinksEditor links={draft.links} canEdit={canEdit} onChange={(links) => edit({ links })} />
              </Detail>
            )}

            {/* Throwing the row away sits apart from keeping the edits or putting them back. */}
            {canEdit && (
              <div className="col-span-2 flex items-center gap-1.5 pt-0.5 @max-[28rem]/assets:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.name}`}
                  onClick={onRemove}
                  className="mr-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  data-testid="asset-remove"
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
                {/* Nothing changed yet: there is nothing to throw away, and
                    the button is still the way out of the open row — so it
                    says what it does instead of pretending otherwise. */}
                <Button type="button" variant="ghost" size="sm" onClick={discard} className="h-7 px-2.5 text-xs" data-testid="asset-discard">
                  {dirty ? "Discard" : "Close"}
                </Button>
                <Button type="button" size="sm" onClick={save} disabled={!dirty && !typing} className="h-7 px-3 text-xs" data-testid="asset-update">
                  Update
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** A block as a line added to it, or moved into it, needs it. */
/** How far off a due date is, in days: "Today", "In 3 days", "2 days late". */
function dueDistance(dueDate: string): string | null {
  const days = daysUntil(dueDate);
  if (days === null) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return days === -1 ? "1 day late" : `${-days} days late`;
}

/** A closed line's details in full, each only when the line has it. */
function AssetDetailLine({ row, typeLabel, done, overdue, indent }: { row: AssetComposerRow; typeLabel: ReturnType<typeof assetTypeLabel>; done: boolean; overdue: boolean; indent: boolean }) {
  const links = row.links.length + row.blockLinks.length;
  const distance = row.dueDate && !done ? dueDistance(row.dueDate) : null;
  if (row.quantity === null && !typeLabel && !row.dueDate && !row.notes && links === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 pr-2.5 pb-2 text-2xs text-muted-foreground", indent ? "pl-[2.125rem]" : "pl-2.5")} data-testid="asset-detail-line">
      {row.quantity !== null && <span className="rounded bg-muted/70 px-1 py-px text-[10px] font-medium tabular">×{row.quantity}</span>}
      {typeLabel && <LabelPill label={typeLabel} appearance="soft" size="sm" className="h-5 max-w-32 px-1.5 text-[10px]" />}
      {row.dueDate && (
        <span className={cn("inline-flex items-center gap-1 tabular", overdue && "font-medium text-red-600 dark:text-red-400")} data-testid="asset-detail-due">
          {overdue ? <TriangleAlert className="size-3 shrink-0" /> : <CalendarDays className="size-3 shrink-0" />}
          {formatShortDate(row.dueDate)}
          {distance && <span className={cn(!overdue && "text-foreground/80")}>· {distance}</span>}
        </span>
      )}
      {links > 0 && (
        <span className="inline-flex items-center gap-1 tabular">
          <Link2 className="size-3 shrink-0" /> {links} {links === 1 ? "link" : "links"}
        </span>
      )}
      {row.notes && (
        <span className="inline-flex min-w-0 basis-full items-center gap-1" title={row.notes}>
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{row.notes}</span>
        </span>
      )}
    </div>
  );
}

function blockTarget(blockId: string, blockName: string, lines: readonly AssetComposerRow[]): AssetBlockTarget {
  return { blockId, blockName, assigneeIds: blockAssignees(lines), blockLinks: lines[0]?.blockLinks ?? [] };
}

/** Who a block is on: everyone in charge of any of its lines, in the order they first appear. */
function blockAssignees(lines: readonly AssetComposerRow[]): string[] {
  const ids: string[] = [];
  for (const line of lines) for (const id of line.assigneeIds) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/**
 * A block: several lines under one name and one person in charge — one
 * designer's poster, tiles and banner, each with its own type, quantity and
 * due date. The header holds what the lines share; each line underneath is an
 * ordinary line, opened, ticked off and counted like any other.
 */
function AssetBlockCard({
  name,
  lines,
  fields,
  assetTypes,
  users,
  canEdit,
  addable,
  onAdd,
  onPatch,
  onSave,
  onRemove,
  children,
}: {
  name: string;
  lines: readonly AssetComposerRow[];
  fields: Required<AssetComposerFields>;
  assetTypes: readonly TagOption[];
  users: User[];
  canEdit: boolean;
  addable: boolean;
  onAdd: (name: string) => void;
  onPatch: (patch: AssetBlockPatch) => void;
  onSave?: (block: AssetBlockForm) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const blockLinks = lines[0]?.blockLinks ?? [];
  const canOpen = canEdit && !!onSave;
  const [newName, setNewName] = React.useState("");
  const menuFocus = useMenuFocusGuard();

  const assigneeIds = blockAssignees(lines);
  const assignees = assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const done = lines.filter((line) => line.completedAt !== null).length;
  const outstanding = lines.filter((line) => line.completedAt === null && line.dueDate);
  const overdue = outstanding.some((line) => isOverdue(line.dueDate));
  const nextDue = outstanding.map((line) => line.dueDate!).sort()[0] ?? null;

  const add = () => {
    const line = newName.trim();
    if (!line) return;
    onAdd(line);
    setNewName("");
  };

  const linkActions = fields.links ? linkMenuActions(blockLinks) : [];
  const menuActions: MenuAction[] = [
    ...linkActions,
    ...(canEdit
      ? ([
          ...(linkActions.length ? [{ type: "separator" as const }] : []),
          canOpen
            ? { type: "item", label: "Edit block", icon: <Pencil />, onSelect: () => menuFocus.run(() => setEditing(true)), testId: "asset-block-edit" }
            : { type: "item", label: "Rename block", icon: <Pencil />, onSelect: () => menuFocus.run(() => setRenaming(true)), testId: "asset-block-rename" },
          { type: "item", label: "Ungroup", icon: <Ungroup />, onSelect: () => onPatch({ ungroup: true }), testId: "asset-block-ungroup" },
          { type: "separator" },
          { type: "item", label: "Remove block", icon: <Trash2 />, destructive: true, onSelect: () => setConfirming(true), testId: "asset-block-remove" },
        ] satisfies MenuAction[])
      : []),
  ];

  return (
    <li className="rounded-2xl border border-border/70 bg-muted/30 p-1.5" data-testid="asset-block" data-block-name={name}>
      {/* Padded on the right like a line card (its border and px-2.5), so the
          header's menu and chevron sit in the same column as the lines'. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pr-[0.6875rem] pl-1.5">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {renaming && canEdit ? (
          <TextField
            value={name}
            placeholder="Block"
            ariaLabel={`Block name: ${name}`}
            canEdit
            autoFocus
            onCommit={(next) => next.trim() && next.trim() !== name && onPatch({ name: next.trim() })}
            onDone={() => setRenaming(false)}
            testId="asset-block-title"
            className="min-w-0 flex-1 font-semibold"
          />
        ) : (
          // The name opens the block's dialog, where everything about it is
          // edited at once; the chevron folds it.
          <button
            type="button"
            onClick={() => (canOpen ? setEditing(true) : setCollapsed((c) => !c))}
            onDoubleClick={() => canEdit && !canOpen && setRenaming(true)}
            aria-expanded={canOpen ? undefined : !collapsed}
            title={canOpen ? "Edit block" : undefined}
            className="min-w-[4rem] flex-1 truncate py-0.5 text-left text-[13px] font-semibold select-none"
            data-testid="asset-block-title"
          >
            {name}
          </button>
        )}

        <span className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
          <span className="tabular" data-testid="asset-block-progress">
            {done}/{lines.length}
          </span>
          {fields.due && nextDue && (
            <span className={cn("flex items-center gap-1 tabular", overdue && "font-medium text-red-600 dark:text-red-400")}>
              {overdue && <TriangleAlert className="size-2.5 shrink-0" />}
              {formatShortDate(nextDue)}
            </span>
          )}
        </span>

        {/* The one thing every line in the block shares, set in one place. */}
        {fields.people && (
          <Popover>
            <PopoverTrigger asChild disabled={!canEdit}>
              <button
                type="button"
                className="flex h-7 max-w-40 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-background"
                aria-label={`Block in charge: ${assignees.length > 0 ? assignees.map((u) => u.displayName).join(", ") : "nobody"}`}
                data-testid="asset-block-assignee"
              >
                {assignees.length > 0 ? (
                  <span className="flex shrink-0 -space-x-1">
                    {assignees.slice(0, 3).map((u) => (
                      <UserAvatar key={u.id} user={u} size="xs" tooltip={false} className="size-4.5 text-[8px] ring-1" />
                    ))}
                  </span>
                ) : (
                  <UserRound className="size-3 shrink-0 opacity-60" />
                )}
                <span className={cn("truncate", assignees.length === 0 && "text-muted-foreground/80")}>
                  {assignees.length === 0 ? "In charge" : assignees.length === 1 ? assignees[0]!.firstName : `${assignees.length} people`}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <PersonPicker users={users} value={assigneeIds} onChange={(ids) => onPatch({ assigneeIds: ids })} />
            </PopoverContent>
          </Popover>
        )}

        <span className="flex shrink-0 items-center gap-0.5">
          {menuActions.length > 0 && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Options for ${name}`} title="More" data-testid="asset-block-menu" className={rowActionClass}>
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
                {renderDropdown(menuActions)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? `Show ${name}` : `Fold ${name}`} data-testid="asset-block-toggle" className={rowActionClass}>
            <ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} />
          </button>
        </span>
      </div>

      {!collapsed && (
        <>
          <ul className="mt-1 space-y-1.5" data-testid="asset-block-lines">
            {children}
          </ul>
          {canEdit && addable && (
            <div className="mt-1.5 flex items-center gap-2 rounded-xl px-2.5 py-1 focus-within:bg-background focus-within:ring-2 focus-within:ring-ring @min-[28rem]/assets:ml-[1.625rem]">
              <Plus className="size-3.5 shrink-0 text-muted-foreground/60" />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  add();
                }}
                placeholder="Add to this block"
                aria-label={`Add an item to ${name}`}
                data-testid="asset-block-add-input"
                className="h-7 min-w-0 flex-1 truncate bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          )}
        </>
      )}

      {canOpen && (
        <AssetBlockDialog
          open={editing}
          onOpenChange={setEditing}
          block={{
            name,
            assigneeIds,
            links: blockLinks,
            lines: lines.map((line) => ({ id: line.id, name: line.name, assetType: line.assetType, quantity: line.quantity, dueDate: line.dueDate })),
          }}
          assetTypes={assetTypes}
          users={users}
          onSubmit={onSave!}
        />
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${name}?`}
        description={lines.length === 1 ? "Its one item goes with it." : `All ${lines.length} items in it go with it.`}
        confirmLabel="Remove"
        destructive
        onConfirm={onRemove}
      />
    </li>
  );
}

/**
 * One labelled field of the open row's form.
 *
 * Narrow, a short field puts its label beside it, so the form is one column of
 * rows rather than two columns of truncated boxes. `stacked` keeps the label
 * above for the long ones — the notes and the links — which want the width.
 */
function Detail({ label, className, stacked = false, children }: { label: string; className?: string; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid min-w-0 gap-1", !stacked && "@max-[28rem]/assets:grid-cols-[5.5rem_minmax(0,1fr)] @max-[28rem]/assets:items-center @max-[28rem]/assets:gap-2", className)}>
      <span className="label-quiet">{label}</span>
      {children}
    </div>
  );
}

/** A text field that saves on blur or Enter and gives up on Escape. */
function TextField({
  value,
  placeholder,
  ariaLabel,
  canEdit,
  onCommit,
  testId,
  className,
  autoFocus,
  onDone,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  canEdit: boolean;
  onCommit: (next: string) => void;
  testId: string;
  className?: string;
  /** Renaming: take the caret and select what is there, so typing replaces the name. */
  autoFocus?: boolean;
  /** Called once the field is finished with, committed or not. */
  onDone?: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  // A save elsewhere (another tab, a linked copy) replaces the draft; a draft in progress is otherwise kept.
  const [seen, setSeen] = React.useState(value);
  const input = React.useRef<HTMLInputElement>(null);
  // Escape blurs, and the blur must not save what Escape just threw away.
  const abandoned = React.useRef(false);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  React.useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);
  if (!canEdit) {
    return (
      <span className={cn("min-w-0 truncate text-[13px]", className)} data-testid={testId}>
        {value || <span className="text-muted-foreground/70">—</span>}
      </span>
    );
  }
  return (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (abandoned.current) {
          abandoned.current = false;
          setDraft(value);
        } else {
          onCommit(draft);
        }
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          abandoned.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn("h-7 min-w-0 rounded-md bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/60 hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring", className)}
    />
  );
}

/** "− 6 +": a stepper, since most edits are one either way; typing a number in the middle works too. */
function QuantityChip({ value, canEdit, onChange }: { value: number | null; canEdit: boolean; onChange: (next: number | null) => void }) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value === null ? "" : String(value));
  }
  const commit = () => {
    const text = draft.trim();
    if (text === "") return onChange(null);
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return setDraft(value === null ? "" : String(value));
    onChange(Math.round(n));
  };
  const step = (delta: number) => onChange(Math.max(0, (value ?? 1) + delta));
  if (!canEdit) {
    return (
      <span className={cn(fieldClass, "tabular")} data-testid="asset-quantity-readonly">
        <Hash className="size-3 opacity-60" /> {value ?? 1}
      </span>
    );
  }
  return (
    <span className={cn(fieldClass, "justify-between gap-0 px-0.5 tabular")} data-testid="asset-quantity-chip">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="One fewer"
        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        data-testid="asset-quantity-minus"
      >
        <Minus className="size-3" />
      </button>
      <input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`Quantity: ${value ?? "not set"}`}
        data-testid="asset-quantity"
        className="h-6 min-w-0 flex-1 bg-transparent text-center text-xs outline-none focus:rounded-md focus:bg-background focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="One more"
        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
        data-testid="asset-quantity-plus"
      >
        <Plus className="size-3" />
      </button>
    </span>
  );
}
