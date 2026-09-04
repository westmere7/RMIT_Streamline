"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";
import { cn } from "@/lib/utils";
import type { ColumnMappingReport } from "@/services";

export interface SyncFieldListProps {
  mapping: ColumnMappingReport;
  /** Exclusion keys: "name", "description" or column ids from either board. */
  excluded: ReadonlySet<string>;
  /** Called with every key that should flip together (a column pair carries both ids). */
  onToggle?: (keys: string[], on: boolean) => void;
  boardName: string;
  otherBoardName: string;
  className?: string;
}

/**
 * The "what stays in sync" checklist shared by the link dialog and the linked
 * items panel. Everything the two boards have in common is on by default;
 * columns only one board has are listed greyed out so nobody wonders why they
 * never sync.
 */
export function SyncFieldList({ mapping, excluded, onToggle, boardName, otherBoardName, className }: SyncFieldListProps) {
  const readOnly = !onToggle;
  const nameOn = !excluded.has(LINK_FIELD_NAME) && !excluded.has(LINK_FIELD_DESCRIPTION);
  return (
    <ul className={cn("space-y-0.5 text-[13px]", className)} data-testid="sync-preview">
      <FieldRow
        checked={nameOn}
        readOnly={readOnly}
        onChange={(on) => onToggle?.([LINK_FIELD_NAME, LINK_FIELD_DESCRIPTION], on)}
        icon={<Check className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />}
        label="Name and description"
      />
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
