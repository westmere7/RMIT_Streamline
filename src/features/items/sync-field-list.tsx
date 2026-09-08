"use client";

import { Check, Hash, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME, LINK_FIELD_REFERENCE } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";
import { cn } from "@/lib/utils";
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
 * never sync.
 */
export function SyncFieldList({ mapping, excluded, onToggle, boardName, otherBoardName, reference, className }: SyncFieldListProps) {
  const readOnly = !onToggle;
  const nameOn = !excluded.has(LINK_FIELD_NAME) && !excluded.has(LINK_FIELD_DESCRIPTION);
  const referenceOn = !excluded.has(LINK_FIELD_REFERENCE);
  // Both sides arrived with a code of their own: carrying one across means the
  // other stops answering to the code people already have for it.
  const winner = reference?.from === "target" ? reference.other : reference?.self;
  const loser = reference?.from === "target" ? reference.self : reference?.other;
  const clash = referenceOn && !!reference && !!winner && !!loser && winner !== loser;
  return (
    <ul className={cn("space-y-0.5 text-[13px]", className)} data-testid="sync-preview">
      <FieldRow
        checked={nameOn}
        readOnly={readOnly}
        onChange={(on) => onToggle?.([LINK_FIELD_NAME, LINK_FIELD_DESCRIPTION], on)}
        icon={<Check className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />}
        label="Name and description"
      />
      {reference && (
        <>
          <FieldRow
            checked={referenceOn}
            readOnly={readOnly}
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
            onChange={(on) => onToggle?.([source.id, target.id], on)}
            icon={<Icon className="size-3.5 shrink-0 text-muted-foreground" />}
            label={sameName ? source.name : `${source.name} → ${target.name}`}
          />
        );
      })}
      {[...mapping.unmapped.map((c) => ({ column: c, where: boardName })), ...mapping.targetOnly.map((c) => ({ column: c, where: otherBoardName }))].map(({ column, where }) => {
        const Icon = COLUMN_TYPE_ICONS[column.type];
        return (
          <li key={column.id} className="flex h-8 items-center gap-2.5 px-1 text-muted-foreground/60">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <Icon className="size-3.5" />
            </span>
            <span className="truncate">
              {column.name} <span className="text-2xs">· only on {where}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FieldRow({ checked, readOnly, onChange, icon, label }: { checked: boolean; readOnly: boolean; onChange: (on: boolean) => void; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <label className={cn("flex h-8 items-center gap-2.5 rounded-md px-1", !readOnly && "cursor-pointer hover:bg-accent/60", !checked && "text-muted-foreground")}>
        {readOnly ? (
          <span className="flex size-4 shrink-0 items-center justify-center">{checked ? icon : <span className="size-2 rounded-full border border-muted-foreground/40" />}</span>
        ) : (
          <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} aria-label={`Sync ${label}`} />
        )}
        {!readOnly && icon}
        <span className={cn("truncate", !checked && "line-through decoration-muted-foreground/40")}>{label}</span>
      </label>
    </li>
  );
}
