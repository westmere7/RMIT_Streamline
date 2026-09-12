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
import { LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME, type ColumnPair, type Item } from "@/domain";
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

/** No row is waiting; one object rather than a new empty set on every render. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

/** Items on other boards this item is kept in sync with. */
export function LinkedItemsSection({ item }: { item: Item }) {
  const { board, canEdit } = useBoardContext();
  // A request waiting to be allocated is not work yet, and a link would
  // mirror it onto a team's board while it still sat in the queue. Allocation
  // moves it; the panel says so where the button used to be.
  const queued = board.system === "TASK_ALLOCATION";
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
        {canEdit && !queued && (
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
          {queued
            ? "Nothing here can be linked while it is waiting to be allocated. Place it with a team and the request moves there — links come after that."
            : canEdit
              ? "Not linked to any other item yet. Linked items stay in sync across boards — name, description and every column both boards share."
              : "Not linked to any other item."}
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
  const { unlink, updateSync, updatePairs } = useLinkMutations(item.id);
  const [editing, setEditing] = React.useState(false);
  // What the last toggle asked for, so the popover can say a row is waiting in
  // place of its checkbox rather than sitting there looking like nothing
  // happened.
  const [asked, setAsked] = React.useState<{ keys: string[]; on: boolean } | null>(null);
  // A row stops waiting when the link itself agrees, not when the write returns:
  // the refetch lands a moment later, and clearing on settle put the old
  // checkbox back in between — a tick that flickered back on before going off.
  const granted = !asked || asked.keys.every((key) => asked.on !== view.link.excluded.includes(key));
  const saving: ReadonlySet<string> = asked && !granted ? new Set(asked.keys) : EMPTY_KEYS;
  const visible = canViewBoard(ws.permissions, view.board);
  const removable = canEdit && canEditBoard(ws.permissions, view.board);
  const owners = view.ownerIds.map((id) => ws.userById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  const team = ws.teamById(view.board.teamId);
  const href = ws.boardPath(view.board, { itemId: view.item.id });

  if (!visible) {
    return (
      <li className="flex items-center gap-2.5 px-3.5 py-3 text-[13px] text-muted-foreground">
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
        {/* The task line: what it is and where it stands, with where it lives
            under it. Four things share this line, so it is given the room to
            hold them rather than the least it can be drawn in. */}
        <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-white", colorClasses(view.board.color).solid)}>
            <DynamicIcon name={view.board.icon} className="size-4" />
          </span>
          <Link href={href} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {view.item.name}
          </Link>
          <LabelPill label={view.status} size="sm" emptyText="" striped={view.statusStuck} />
          {view.dueDate && <span className={cn("shrink-0 text-xs tabular", isOverdue(view.dueDate) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(view.dueDate)}</span>}
          {owners.length > 0 && <AvatarStack users={owners} size="xs" max={3} />}
        </div>
        {/* Indented past the icon so it reads as the task's address, not a second line of the card. */}
        <p className="mt-1.5 truncate pl-11 text-xs text-muted-foreground">
          {view.board.name}
          {team ? ` · ${team.name}` : ""}
          {view.group ? ` · ${view.group.name}` : ""}
          {view.parent ? ` · under ${view.parent.name}` : ""}
        </p>
        </div>
        {/* The sync strip: what flows between the two, and the controls. */}
        <div className="flex min-w-0 items-center gap-2 border-t border-border/50 bg-surface/50 px-3.5 py-2 text-xs text-muted-foreground">
          <SyncSummary
            view={view}
            boardName={board.name}
            editable={removable}
            editing={editing}
            onEditingChange={setEditing}
            saving={saving}
            onToggle={(keys, on) => {
              const next = new Set(view.link.excluded);
              for (const key of keys) {
                if (on) next.delete(key);
                else next.add(key);
              }
              setAsked({ keys, on });
              updateSync.mutate({ linkId: view.link.id, excluded: [...next] }, { onError: () => setAsked(null) });
            }}
            onPair={(columnId, otherColumnId) => {
              const kept = view.link.pairs.filter((p) => !p.includes(columnId) && (otherColumnId === null || !p.includes(otherColumnId)));
              const next: ColumnPair[] = otherColumnId ? [...kept, [columnId, otherColumnId]] : kept;
              updatePairs.mutate({ linkId: view.link.id, pairs: next });
            }}
          />
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <SimpleTooltip label={`Open on ${view.board.name}`}>
              <Button variant="ghost" size="icon-sm" aria-label={`Open ${view.item.name} on ${view.board.name}`} className="text-muted-foreground" asChild>
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
  saving,
  onToggle,
  onPair,
}: {
  view: LinkedItemView;
  boardName: string;
  editable: boolean;
  editing: boolean;
  onEditingChange: (open: boolean) => void;
  saving: ReadonlySet<string>;
  onToggle: (keys: string[], on: boolean) => void;
  onPair: (columnId: string, otherColumnId: string | null) => void;
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
    </span>
  );

  if (!editable) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Link2 className="size-3.5 shrink-0" />
        {summary}
      </span>
    );
  }

  return (
    <Popover open={editing} onOpenChange={onEditingChange}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 text-left hover:bg-accent hover:text-foreground" aria-label="Choose what syncs" data-testid="sync-summary">
          <Link2 className="size-3.5 shrink-0" />
          {summary}
          <Settings2 className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 label-quiet">What stays in sync</p>
        <SyncFieldList
          mapping={view.mapping}
          excluded={excluded}
          onToggle={onToggle}
          pending={saving}
          pairs={view.link.pairs}
          onPair={onPair}
          boardName={boardName}
          otherBoardName={view.board.name}
        />
        <p className="mt-2 text-2xs text-muted-foreground">Fields you switch back on are filled in from this item.</p>
      </PopoverContent>
    </Popover>
  );
}

function UnlinkButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <SimpleTooltip label="Unlink">
      <Button variant="ghost" size="icon-sm" aria-label={`Unlink ${name}`} className="text-muted-foreground hover:text-destructive" onClick={onClick}>
        <Unlink />
      </Button>
    </SimpleTooltip>
  );
}
