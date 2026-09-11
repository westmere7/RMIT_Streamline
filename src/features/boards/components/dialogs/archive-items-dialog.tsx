"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2Off, LoaderCircle, RefreshCw } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { ArchiveLinkPolicy } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { cn, pluralize } from "@/lib/utils";

/**
 * The one place archiving is confirmed.
 *
 * Most of the time it asks nothing interesting and is an ordinary
 * confirmation. When the items carry links it is a real question: a linked task
 * is kept in step with its twin on another board, so archiving one side and
 * leaving the other means that board keeps mirroring a task nobody can see any
 * more. Breaking the links is offered first, because it changes nothing on
 * anyone else's board.
 */
export function ArchiveItemsDialog() {
  const { board, model, mutations } = useBoardContext();
  const services = useServices();
  const ws = useWorkspace();
  const itemIds = useBoardUiStore((s) => s.archiveRequestIds);
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const clearSelection = useBoardUiStore((s) => s.clearSelection);
  const open = itemIds !== null && itemIds.length > 0;
  const ids = React.useMemo(() => itemIds ?? [], [itemIds]);

  // The choice is remembered against the items it was made for, so a new set of
  // items comes up on the safe answer rather than inheriting the last one.
  const key = ids.join(",");
  const [chosen, setChosen] = React.useState<{ key: string; policy: ArchiveLinkPolicy } | null>(null);
  const policy: ArchiveLinkPolicy = chosen?.key === key ? chosen.policy : "break";
  const setPolicy = (next: ArchiveLinkPolicy) => setChosen({ key, policy: next });

  const impact = useQuery({
    queryKey: ["archive-link-impact", board.id, [...ids].sort().join(",")],
    queryFn: () => services.items.archiveLinkImpact(ids),
    enabled: open,
  });

  // Mounted only while something is waiting on it. The ids are the whole of
  // what it says, so a render after they are cleared - which is exactly what
  // closing does - had the title counting down to "Archive 0 items?" behind the
  // fading overlay.
  const linked = impact.data?.linkedItemIds.length ?? 0;
  const connected = impact.data?.connectedItemIds.length ?? 0;
  const boardNames = (impact.data?.connectedBoardIds ?? []).map((id) => ws.boardById(id)?.name).filter((name): name is string => !!name);
  const asking = linked > 0;
  const names = ids.map((id) => model.itemById.get(id)?.name).filter((name): name is string => !!name);
  const title = ids.length === 1 ? `Archive “${names[0] ?? "this item"}”?` : `Archive ${pluralize(ids.length, "item")}?`;

  if (!open) return null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => !next && setArchiveRequest(null)}
      title={title}
      description={
        impact.isPending && open ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-3.5 animate-spin" /> Checking what is linked…
          </span>
        ) : asking ? (
          `${linked === ids.length ? (ids.length === 1 ? "It is" : "They are") : `${linked} of them are`} linked to ${pluralize(connected, "item")} on ${boardNames.length > 0 ? boardNames.join(", ") : "another board"}.`
        ) : (
          "It comes off the board and keeps everything on it. You can restore it from the board's archive."
        )
      }
      confirmLabel="Archive"
      confirmDisabled={impact.isPending && open}
      onConfirm={async () => {
        const target = ids;
        setArchiveRequest(null);
        clearSelection(board.id);
        await mutations.archiveItems(target, asking ? { links: policy } : undefined);
      }}
    >
      {asking && (
        <div className="space-y-1.5" role="radiogroup" aria-label="What happens to the linked items">
          <PolicyOption
            active={policy === "break"}
            onSelect={() => setPolicy("break")}
            icon={<Link2Off className="size-4" />}
            title="Break the links first"
            hint="The linked items stay where they are and stop following this one."
            testId="archive-policy-break"
          />
          <PolicyOption
            active={policy === "cascade"}
            onSelect={() => setPolicy("cascade")}
            icon={<RefreshCw className="size-4" />}
            title="Archive the linked items too"
            hint={`Puts ${pluralize(connected, "item")} away on ${pluralize(boardNames.length || 1, "other board")} as well.`}
            testId="archive-policy-cascade"
          />
        </div>
      )}
    </ConfirmDialog>
  );
}

function PolicyOption({
  active,
  onSelect,
  icon,
  title,
  hint,
  testId,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      data-testid={testId}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
        active ? "border-ring bg-accent-soft/60" : "border-border/70 hover:bg-accent/50",
      )}
    >
      <span className={cn("mt-0.5 shrink-0", active ? "text-foreground" : "text-muted-foreground")}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-2xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
