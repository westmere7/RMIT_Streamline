"use client";

import { CornerDownRight, Link2, Lock, Plus, Unlink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { LinkItemDialog } from "@/features/items/link-item-dialog";
import { useItemLinks, useLinkMutations } from "@/features/items/link-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { canEditBoard, canViewBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import type { LinkedItemView } from "@/services";
import { useBoardUiStore } from "@/stores/board-ui-store";

/** Items on other boards this item is kept in sync with. */
export function LinkedItemsSection({ item }: { item: Item }) {
  const { canEdit } = useBoardContext();
  const links = useItemLinks(item.id);
  const [opened, setOpened] = React.useState(false);

  // "Link to another item…" from a row menu opens the panel with the dialog ready;
  // closing the dialog clears that request again.
  const pending = useBoardUiStore((s) => s.linkDialogItemId);
  const setLinkDialogItem = useBoardUiStore((s) => s.setLinkDialogItem);
  const dialogOpen = opened || pending === item.id;
  const setDialogOpen = (open: boolean) => {
    setOpened(open);
    if (!open && pending === item.id) setLinkDialogItem(null);
  };

  const views = links.data ?? [];

  return (
    <section data-testid="linked-items">
      <h3 className="mb-1.5 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">Linked items {views.length > 0 && <span className="tabular">{views.length}</span>}</span>
        {canEdit && (
          <Button variant="ghost" size="sm" className="-my-1 h-6 normal-case tracking-normal" onClick={() => setDialogOpen(true)} data-testid="link-item-button">
            <Plus /> Link item
          </Button>
        )}
      </h3>
      {links.isLoading ? (
        <Skeleton className="h-12" />
      ) : views.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Not linked to any other item yet. Linked items stay in sync across boards — name, description and every column both boards share.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {views.map((view) => (
            <LinkedItemRow key={view.link.id} item={item} view={view} />
          ))}
        </ul>
      )}
      <LinkItemDialog item={item} open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  );
}

function LinkedItemRow({ item, view }: { item: Item; view: LinkedItemView }) {
  const ws = useWorkspace();
  const { board, canEdit } = useBoardContext();
  const { unlink } = useLinkMutations(item.id);
  const visible = canViewBoard(ws.permissions, view.board);
  const removable = canEdit && canEditBoard(ws.permissions, view.board);
  const owners = view.ownerIds.map((id) => ws.userById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const team = ws.teamById(view.board.teamId);

  if (!visible) {
    return (
      <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground">
        <Lock className="size-3.5 shrink-0" />
        <span className="flex-1">Linked to an item on a board you can’t access.</span>
        {removable && <UnlinkButton name="this item" onClick={() => unlink.mutate(view.link.id)} />}
      </li>
    );
  }

  return (
    <li className="group/link px-3 py-2" data-testid="linked-item">
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-white", colorClasses(view.board.color).solid)}>
          <DynamicIcon name={view.board.icon} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={ws.boardPath(view.board, { itemId: view.item.id })} className="block truncate text-[13px] font-medium hover:underline">
            {view.item.name}
          </Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
            <span className="truncate">
              {view.board.name}
              {team ? ` · ${team.name}` : ""}
              {view.group ? ` · ${view.group.name}` : ""}
            </span>
            {view.parent && (
              <span className="flex shrink-0 items-center gap-0.5">
                <CornerDownRight className="size-3" /> Subitem of {view.parent.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {view.dueDate && (
            <span className={cn("text-xs tabular", isOverdue(view.dueDate) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(view.dueDate)}</span>
          )}
          {owners.length > 0 && <AvatarStack users={owners} size="xs" max={3} />}
          <LabelPill label={view.status} size="sm" emptyText="" />
          {removable && <UnlinkButton name={view.item.name} onClick={() => unlink.mutate(view.link.id)} />}
        </div>
      </div>
      <SyncSummary view={view} boardName={board.name} />
    </li>
  );
}

/** One line saying which fields flow between the two boards. */
function SyncSummary({ view, boardName }: { view: LinkedItemView; boardName: string }) {
  const { mapped, unmapped } = view.mapping;
  const synced = mapped.map((m) => (m.source.name.trim().toLowerCase() === m.target.name.trim().toLowerCase() ? m.source.name : `${m.source.name} → ${m.target.name}`));
  return (
    <p className="mt-1.5 flex items-start gap-1 pl-[34px] text-2xs text-muted-foreground" title={unmapped.length ? `Only on ${boardName}: ${unmapped.map((c) => c.name).join(", ")}` : undefined}>
      <Link2 className="mt-px size-3 shrink-0" />
      <span className="min-w-0 truncate">
        Syncs name, description{synced.length ? `, ${synced.join(", ")}` : ""}
        {unmapped.length > 0 && (
          <span className="text-muted-foreground/70">
            {" "}
            · {unmapped.map((c) => c.name).join(", ")} not on {view.board.name}
          </span>
        )}
      </span>
    </p>
  );
}

function UnlinkButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <SimpleTooltip label="Unlink">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Unlink ${name}`}
        className="text-muted-foreground opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 hover:text-destructive"
        onClick={onClick}
      >
        <Unlink />
      </Button>
    </SimpleTooltip>
  );
}
