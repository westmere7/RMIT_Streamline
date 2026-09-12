"use client";

import { Hash, Link2, Loader2, TriangleAlert, Unlink } from "lucide-react";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME, LINK_FIELD_REFERENCE, type BoardColumn, type ColumnPair } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";
import { cn } from "@/lib/utils";
// Straight from the pure mapping rules rather than the services barrel, which
// would drag every service into the client bundle for one predicate.
import { compatibleTypes } from "@/services/item-link-sync";
import type { ColumnMappingReport } from "@/services";

/** The booking code on each side, so the list can say what carrying it would do. */
export interface SyncReference {
  self: string | null;
  other: string | null;
  /** Which side fills the other in. Only then can a code be overwritten. */
  from?: "item" | "target";
}

export interface SyncFieldListProps {
  mapping: ColumnMappingReport;
  /** Exclusion keys: "name", "description" or column ids from either board. */
  excluded: ReadonlySet<string>;
  /** Called with every key that should flip together (a column pair carries both ids). */
  onToggle?: (keys: string[], on: boolean) => void;
  /** Keys whose last toggle has not come back yet; their rows show it in place of the box. */
  pending?: ReadonlySet<string>;
  /** Pairings made by hand, so they can be undone from the rows they produced. */
  pairs?: readonly ColumnPair[];
  /** Pair a column with one on the other board, or `null` to undo a pairing. */
  onPair?: (columnId: string, otherColumnId: string | null) => void;
  boardName: string;
  otherBoardName: string;
  /** Omitted where the codes are not known; the ID# row is then left out. */
  reference?: SyncReference;
  className?: string;
}

/**
 * The "what stays in sync" checklist shared by the link dialog and the linked
 * items panel. Everything the two boards have in common is on by default;
 * columns only one board has are listed greyed out so nobody wonders why they
 * never sync — and, where the caller can save it, offered a counterpart to pair
 * with, which is the only way a column added after the link was made ever joins.
 */
const TextIcon = COLUMN_TYPE_ICONS.TEXT;

export function SyncFieldList({ mapping, excluded, onToggle, pending, pairs, onPair, boardName, otherBoardName, reference, className }: SyncFieldListProps) {
  const readOnly = !onToggle;
  const nameOn = !excluded.has(LINK_FIELD_NAME) && !excluded.has(LINK_FIELD_DESCRIPTION);
  const referenceOn = !excluded.has(LINK_FIELD_REFERENCE);
  // Both sides arrived with a code of their own: carrying one across means the
  // other stops answering to the code people already have for it.
  const winner = reference?.from === "target" ? reference.other : reference?.self;
  const loser = reference?.from === "target" ? reference.self : reference?.other;
  const clash = referenceOn && !!reference && !!winner && !!loser && winner !== loser;
  const byHand = new Set((pairs ?? []).map((p) => [...p].sort().join(":")));
  const isPending = (keys: string[]) => !!pending && keys.some((k) => pending.has(k));
  return (
    <ul className={cn("space-y-0.5 text-[13px]", className)} data-testid="sync-preview">
      {/* Name and description are text like any text column, and drawn like
          one: a green tick here said "this one is special" about the only row
          that is not. */}
      <FieldRow
        checked={nameOn}
        readOnly={readOnly}
        pending={isPending([LINK_FIELD_NAME, LINK_FIELD_DESCRIPTION])}
        onChange={(on) => onToggle?.([LINK_FIELD_NAME, LINK_FIELD_DESCRIPTION], on)}
        icon={<TextIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        label="Name and description"
      />
      {reference && (
        <>
          <FieldRow
            checked={referenceOn}
            readOnly={readOnly}
            pending={isPending([LINK_FIELD_REFERENCE])}
            onChange={(on) => onToggle?.([LINK_FIELD_REFERENCE], on)}
            icon={<Hash className="size-3.5 shrink-0 text-muted-foreground" />}
            label={`ID# ${reference.self ?? reference.other ?? "—"}`}
          />
          {clash && (
            <li className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-2xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" data-testid="sync-reference-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Both tasks already have an ID. Linking gives them both <strong className="font-semibold tabular">{winner}</strong>, and <span className="tabular">{loser}</span> stops being used.
                Untick ID# to leave them as they are.
              </span>
            </li>
          )}
        </>
      )}
      {mapping.mapped.map(({ source, target }) => {
        const Icon = COLUMN_TYPE_ICONS[source.type];
        const sameName = source.name.trim().toLowerCase() === target.name.trim().toLowerCase();
        return (
          <FieldRow
            key={source.id}
            checked={!excluded.has(source.id) && !excluded.has(target.id)}
            readOnly={readOnly}
            pending={isPending([source.id, target.id])}
            onChange={(on) => onToggle?.([source.id, target.id], on)}
            icon={<Icon className="size-3.5 shrink-0 text-muted-foreground" />}
            label={sameName ? source.name : `${source.name} → ${target.name}`}
            onUnpair={onPair && byHand.has([source.id, target.id].sort().join(":")) ? () => onPair(source.id, null) : undefined}
          />
        );
      })}
      {[
        ...mapping.unmapped.map((c) => ({ column: c, where: boardName, candidates: mapping.targetOnly, otherBoard: otherBoardName })),
        ...mapping.targetOnly.map((c) => ({ column: c, where: otherBoardName, candidates: mapping.unmapped, otherBoard: boardName })),
      ].map(({ column, where, candidates, otherBoard }) => {
        const Icon = COLUMN_TYPE_ICONS[column.type];
        const fits = candidates.filter((c) => compatibleTypes(column.type, c.type));
        return (
          <li key={column.id} className="flex h-8 items-center gap-2.5 px-1 text-muted-foreground/60">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 truncate">
              {column.name} <span className="text-2xs">· only on {where}</span>
            </span>
            {onPair && fits.length > 0 && <PairPicker column={column} candidates={fits} otherBoard={otherBoard} onPick={(id) => onPair(column.id, id)} />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Offers the columns on the other board this one could be the same field as.
 *
 * Only columns that could actually carry the value are listed: pairing a date
 * with a status would make a row that can never sync anything.
 */
function PairPicker({ column, candidates, otherBoard, onPick }: { column: BoardColumn; candidates: readonly BoardColumn[]; otherBoard: string; onPick: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs hover:bg-accent hover:text-foreground"
          aria-label={`Pair ${column.name} with a column on ${otherBoard}`}
          data-testid={`pair-${column.id}`}
        >
          <Link2 className="size-3" /> Pair with…
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {candidates.map((candidate) => {
          const Icon = COLUMN_TYPE_ICONS[candidate.type];
          return (
            <DropdownMenuItem key={candidate.id} onSelect={() => onPick(candidate.id)}>
              <Icon /> <span className="min-w-0 truncate">{candidate.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldRow({
  checked,
  readOnly,
  pending,
  onChange,
  icon,
  label,
  onUnpair,
}: {
  checked: boolean;
  readOnly: boolean;
  pending?: boolean;
  onChange: (on: boolean) => void;
  icon: React.ReactNode;
  label: string;
  onUnpair?: () => void;
}) {
  return (
    <li className="group/sync">
      <label className={cn("flex h-8 items-center gap-2.5 rounded-md px-1", !readOnly && "cursor-pointer hover:bg-accent/60", !checked && "text-muted-foreground")}>
        {readOnly ? (
          <span className="flex size-4 shrink-0 items-center justify-center">{checked ? icon : <span className="size-2 rounded-full border border-muted-foreground/40" />}</span>
        ) : pending ? (
          // The write goes to both boards and can take a moment. The box is
          // replaced rather than merely disabled, because a tick that does not
          // move when clicked reads as a click that missed.
          <span className="flex size-4 shrink-0 items-center justify-center" role="status" aria-label={`Saving ${label}`}>
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          </span>
        ) : (
          <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} aria-label={`Sync ${label}`} />
        )}
        {!readOnly && icon}
        <span className={cn("min-w-0 truncate", !checked && "line-through decoration-muted-foreground/40")}>{label}</span>
        {onUnpair && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onUnpair();
            }}
            aria-label={`Unpair ${label}`}
            title="Unpair these columns"
            className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover/sync:opacity-100"
          >
            <Unlink className="size-3" />
          </button>
        )}
      </label>
    </li>
  );
}
