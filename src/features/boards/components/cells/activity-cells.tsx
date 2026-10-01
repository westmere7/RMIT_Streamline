"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { buttonSettings, dateTimeSettings, formatDateTime, lastUpdatedSettings, type ButtonColumnSettings } from "@/domain";
import { columnAlign } from "@/features/boards/board-model";
import { useButtonPress } from "@/features/boards/button-column";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatRelative } from "@/lib/dates/dates";
import { useClockTick } from "@/hooks/use-clock";
import { cn } from "@/lib/utils";
import { CellShell } from "./cell-shell";
import type { CellProps } from "./cell-renderer";

const EMPTY = <span className="text-muted-foreground/40">—</span>;

/** Who last changed the task and when, as the column's settings say to show it. Never edited. */
export function LastUpdatedCell({ item, column, value, width }: CellProps) {
  const ws = useWorkspace();
  // "3m ago" keeps up without a reload.
  useClockTick();
  const settings = lastUpdatedSettings(column.settings);
  const v = value?.type === "LAST_UPDATED" ? value : null;
  const user = v?.userId ? ws.userById(v.userId) : undefined;
  const exact = v?.at ? formatDateTime(v.at, dateTimeSettings(null)) : null;
  const when = v?.at ? (settings.time === "relative" ? formatRelative(v.at) : exact) : null;
  const label = v?.at ? `${user?.displayName ?? "Someone"}, ${exact}` : "not yet";
  return (
    <CellShell width={width ?? column.width} interactive={false} align={columnAlign(column.type)} aria-label={`${column.name}: ${label} for ${item.name}`} title={v?.at ? label : undefined} data-testid="last-updated-cell">
      {!v?.at ? (
        EMPTY
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          {settings.display !== "time" && user && <UserAvatar user={user} size="xs" tooltip={false} />}
          {settings.display === "person" && <span className="truncate text-xs">{user?.displayName ?? "Someone"}</span>}
          {settings.display !== "person" && <span className="truncate text-xs text-muted-foreground tabular">{when}</span>}
        </span>
      )}
    </CellShell>
  );
}

/** The button itself, in the column's colour and style; also the preview in its settings. */
export function ButtonFace({ settings, busy, disabled, onClick, className }: { settings: ButtonColumnSettings; busy?: boolean; disabled?: boolean; onClick?: (event: React.MouseEvent) => void; className?: string }) {
  const colors = colorClasses(settings.color);
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center justify-center gap-1 rounded-md px-2.5 text-2xs font-semibold transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:opacity-60",
        settings.style === "filled" && colors.solid,
        settings.style === "soft" && colors.soft,
        settings.style === "outline" && cn("border bg-transparent", colors.border, colors.text),
        className,
      )}
      data-testid="button-cell-button"
    >
      {busy && <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />}
      <span className="truncate">{settings.label}</span>
    </button>
  );
}

/**
 * A Button column's cell: the button, which runs the column's steps on this
 * task. Not shown to someone who cannot edit the board, since they could not
 * press it.
 */
export function ButtonCell({ item, column, readOnly, width }: CellProps) {
  const settings = buttonSettings(column.settings);
  const { press, running } = useButtonPress();
  const [asking, setAsking] = React.useState(false);
  const busy = running === item.id;
  const go = () => void press(item, column);
  return (
    <CellShell width={width ?? column.width} interactive={false} align="center" aria-label={`${column.name}: ${settings.label} for ${item.name}`} data-testid="button-cell">
      {!readOnly && (
        <ButtonFace
          settings={settings}
          busy={busy}
          disabled={settings.actions.length === 0}
          onClick={(event) => {
            // The row would open the task.
            event.stopPropagation();
            if (settings.confirm) setAsking(true);
            else go();
          }}
          className="mx-1"
        />
      )}
      {settings.confirm && (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title={`${settings.label}?`}
          description={item.name}
          confirmLabel={settings.label}
          onConfirm={() => {
            setAsking(false);
            go();
          }}
        />
      )}
    </CellShell>
  );
}
