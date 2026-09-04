"use client";

import { CornerDownRight, ExternalLink, Link2, Lock, Plus, Settings2, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { type MenuAction, RowMenu } from "@/components/layout/row-menu";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME, type Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { LinkItemDialog } from "@/features/items/link-item-dialog";
import { useItemLinks, useLinkMutations } from "@/features/items/link-hooks";
import { SyncFieldList } from "@/features/items/sync-field-list";
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
        <span className="flex items-center gap-1.5">
          Linked items {views.length > 0 && <span className="tabular">{views.length}</span>}
        </span>
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
  const router = useRouter();
  const { board, canEdit } = useBoardContext();
  const { unlink, updateSync } = useLinkMutations(item.id);
  const [editing, setEditing] = React.useState(false);
  const visible = canViewBoard(ws.permissions, view.board);
  const removable = canEdit && canEditBoard(ws.permissions, view.board);
  const owners = view.ownerIds.map((id) => ws.userById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const team = ws.teamById(view.board.teamId);
  const href = ws.boardPath(view.board, { itemId: view.item.id });

  if (!visible) {
    return (
      <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground">
        <Lock className="size-3.5 shrink-0" />
        <span className="flex-1">Linked to an item on a board you can’t access.</span>
        {removable && <UnlinkButton name="this item" onClick={() => unlink.mutate(view.link.id)} />}
      </li>
    );
  }

  const actions: MenuAction[] = [
    { type: "item", label: `Open on ${view.board.name}`, icon: <ExternalLink />, onSelect: () => router.push(href) },
    ...(removable
      ? ([
          { type: "item", label: "Choose what syncs…", icon: <Settings2 />, onSelect: () => setEditing(true) },
          { type: "separator" },
          { type: "item", label: "Unlink", icon: <Unlink />, destructive: true, onSelect: () => unlink.mutate(view.link.id) },
        ] as MenuAction[])
      : []),
  ];

  return (
    <li className="group/link" data-testid="linked-item">
      <RowMenu label={`Options for ${view.item.name}`} actions={actions} hideButton>
        <div className="px-3 py-2">
          <div className="flex items-start gap-2.5">
            <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-white", colorClasses(view.board.color).solid)}>
              <DynamicIcon name={view.board.icon} className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <Link href={href} className="block truncate text-[13px] font-medium hover:underline">
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
              {view.dueDate && <span className={cn("text-xs tabular", isOverdue(view.dueDate) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(view.dueDate)}</span>}
              {owners.length > 0 && <AvatarStack users={owners} size="xs" max={3} />}
              <LabelPill label={view.status} size="sm" emptyText="" />
              {removable && <UnlinkButton name={view.item.name} onClick={() => unlink.mutate(view.link.id)} />}
            </div>
          </div>
          <SyncSummary
            view={view}
            boardName={board.name}
            editable={removable}
            editing={editing}
            onEditingChange={setEditing}
            onToggle={(keys, on) => {
              const next = new Set(view.link.excluded);
              for (const key of keys) {
                if (on) next.delete(key);
                else next.add(key);
              }
              updateSync.mutate({ linkId: view.link.id, excluded: [...next] });
            }}
          />
        </div>
      </RowMenu>
    </li>
  );
}

/** One line saying which fields flow between the two boards, with a popover to change it. */
function SyncSummary({
  view,
  boardName,
  editable,
  editing,
  onEditingChange,
  onToggle,
}: {
  view: LinkedItemView;
  boardName: string;
  editable: boolean;
  editing: boolean;
  onEditingChange: (open: boolean) => void;
  onToggle: (keys: string[], on: boolean) => void;
}) {
  const excluded = new Set(view.link.excluded);
  const { mapped, unmapped } = view.mapping;
  const nameOn = !excluded.has(LINK_FIELD_NAME) && !excluded.has(LINK_FIELD_DESCRIPTION);
  const on = mapped.filter((m) => !excluded.has(m.source.id) && !excluded.has(m.target.id));
  const off = mapped.filter((m) => excluded.has(m.source.id) || excluded.has(m.target.id));
  const label = (m: (typeof mapped)[number]) => (m.source.name.trim().toLowerCase() === m.target.name.trim().toLowerCase() ? m.source.name : `${m.source.name} → ${m.target.name}`);
  const synced = [...(nameOn ? ["name, description"] : []), ...on.map(label)];

  const summary = (
    <span className="min-w-0 truncate">
      {synced.length ? `Syncs ${synced.join(", ")}` : "Nothing syncs yet"}
      {off.length > 0 && <span className="text-muted-foreground/70"> · {off.map(label).join(", ")} off</span>}
      {unmapped.length > 0 && <span className="text-muted-foreground/70"> · {unmapped.map((c) => c.name).join(", ")} not on {view.board.name}</span>}
    </span>
  );

  if (!editable) {
    return (
      <p className="mt-1.5 flex items-start gap-1 pl-[34px] text-2xs text-muted-foreground">
        <Link2 className="mt-px size-3 shrink-0" />
        {summary}
      </p>
    );
  }

  return (
    <Popover open={editing} onOpenChange={onEditingChange}>
      <PopoverTrigger asChild>
        <button type="button" className="mt-1.5 flex w-full items-start gap-1 rounded pl-[34px] pr-1 text-left text-2xs text-muted-foreground hover:text-foreground" aria-label="Choose what syncs" data-testid="sync-summary">
          <Link2 className="mt-px size-3 shrink-0" />
          {summary}
          <Settings2 className="ml-auto mt-px size-3 shrink-0 opacity-0 group-hover/link:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">What stays in sync</p>
        <SyncFieldList mapping={view.mapping} excluded={excluded} onToggle={onToggle} boardName={boardName} otherBoardName={view.board.name} />
        <p className="mt-2 text-2xs text-muted-foreground">Fields you switch back on are filled in from this item.</p>
      </PopoverContent>
    </Popover>
  );
}

function UnlinkButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <SimpleTooltip label="Unlink">
      <Button variant="ghost" size="icon-xs" aria-label={`Unlink ${name}`} className="text-muted-foreground opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 hover:text-destructive" onClick={onClick}>
        <Unlink />
      </Button>
    </SimpleTooltip>
  );
}
