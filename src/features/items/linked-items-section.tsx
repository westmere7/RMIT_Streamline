"use client";

import { ExternalLink, Link2, Lock, Plus, Settings2, Unlink } from "lucide-react";
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
      <h3 className="mb-1.5 flex items-center justify-between label-quiet">
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
        // What linking does is worth explaining to somebody who can do it. To a
        // reader it is a description of a door they cannot open.
        <p className="text-[13px] text-muted-foreground">
          {canEdit ? "Not linked to any other item yet. Linked items stay in sync across boards — name, description and every column both boards share." : "Not linked to any other item."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
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
        {/* A compact task line: what it is and where it stands; where it lives sits under it. */}
        <div className="px-3 pt-2 pb-2">
        <div className="flex h-7 items-center gap-2.5">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md text-white", colorClasses(view.board.color).solid)}>
            <DynamicIcon name={view.board.icon} className="size-3.5" />
          </span>
          <Link href={href} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:underline">
            {view.item.name}
          </Link>
          <LabelPill label={view.status} size="sm" emptyText="" striped={view.statusStuck} />
          {view.dueDate && <span className={cn("shrink-0 text-xs tabular", isOverdue(view.dueDate) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(view.dueDate)}</span>}
          {owners.length > 0 && <AvatarStack users={owners} size="xs" max={3} />}
        </div>
        <p className="mt-0.5 truncate pl-[34px] text-2xs text-muted-foreground">
          {view.board.name}
          {team ? ` · ${team.name}` : ""}
          {view.group ? ` · ${view.group.name}` : ""}
          {view.parent ? ` · under ${view.parent.name}` : ""}
        </p>
        </div>
        {/* The sync strip: what flows between the two, and the controls. */}
        <div className="flex min-w-0 items-center gap-2 border-t border-border/50 bg-surface/50 px-3 py-1.5 text-2xs text-muted-foreground">
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
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <SimpleTooltip label={`Open on ${view.board.name}`}>
              <Button variant="ghost" size="icon-xs" aria-label={`Open ${view.item.name} on ${view.board.name}`} className="text-muted-foreground" asChild>
                <Link href={href}>
                  <ExternalLink />
                </Link>
              </Button>
            </SimpleTooltip>
            {removable && <UnlinkButton name={view.item.name} onClick={() => unlink.mutate(view.link.id)} />}
          </span>
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

  const detail = [
    synced.length ? `Syncs ${synced.join(", ")}` : "Nothing syncs yet",
    off.length > 0 ? `Off: ${off.map(label).join(", ")}` : null,
    unmapped.length > 0 ? `Not on ${view.board.name}: ${unmapped.map((c) => c.name).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const fieldCount = (nameOn ? 2 : 0) + on.length;
  const summary = (
    <span className="min-w-0 truncate" title={detail}>
      {fieldCount > 0 ? `Syncs ${fieldCount} ${fieldCount === 1 ? "field" : "fields"}` : "Nothing syncs yet"}
      {off.length > 0 && <span className="text-muted-foreground/70"> · {off.length} off</span>}
      {unmapped.length > 0 && <span className="text-muted-foreground/70"> · {unmapped.length} not on {view.board.name}</span>}
    </span>
  );

  if (!editable) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <Link2 className="size-3 shrink-0" />
        {summary}
      </span>
    );
  }

  return (
    <Popover open={editing} onOpenChange={onEditingChange}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-w-0 items-center gap-1 rounded px-1 -mx-1 text-left hover:bg-accent hover:text-foreground" aria-label="Choose what syncs" data-testid="sync-summary">
          <Link2 className="size-3 shrink-0" />
          {summary}
          <Settings2 className="size-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 label-quiet">What stays in sync</p>
        <SyncFieldList mapping={view.mapping} excluded={excluded} onToggle={onToggle} boardName={boardName} otherBoardName={view.board.name} />
        <p className="mt-2 text-2xs text-muted-foreground">Fields you switch back on are filled in from this item.</p>
      </PopoverContent>
    </Popover>
  );
}

function UnlinkButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <SimpleTooltip label="Unlink">
      <Button variant="ghost" size="icon-xs" aria-label={`Unlink ${name}`} className="text-muted-foreground hover:text-destructive" onClick={onClick}>
        <Unlink />
      </Button>
    </SimpleTooltip>
  );
}
