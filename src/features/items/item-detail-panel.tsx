"use client";

import { CornerDownRight, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AttachmentMeta, BoardColumn, Item } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useItemActivity } from "@/features/activity/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { useComments } from "@/features/comments/hooks";
import { ItemUpdates } from "@/features/items/item-updates";
import { LinkedItemsSection } from "@/features/items/linked-items-section";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { newId, nowIso } from "@/lib/ids";
import { cn } from "@/lib/utils";

const FIELD_WIDTH = 260;

export function ItemDetailPanel({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { model, canEdit } = useBoardContext();
  const item = model.itemById.get(itemId);
  const narrow = useMediaQuery("(max-width: 1023px)");
  const [tab, setTab] = React.useState("overview");
  const comments = useComments(itemId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label={item ? item.name : "Item"}
      data-testid="item-panel"
      className={cn(
        // Reads as a card floating above the board: its own surface and elevation,
        // with the board beside it left untouched so items stay glanceable.
        "flex flex-col bg-surface",
        narrow
          ? "fixed inset-0 z-40"
          : "m-2.5 w-[520px] shrink-0 overflow-hidden rounded-2xl border border-border/70 shadow-xl animate-in slide-in-from-right-4 duration-150",
      )}
    >
      {!item ? (
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-end border-b px-3">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
              <X />
            </Button>
          </div>
          <EmptyState title="Item not found" description="It may have been deleted or archived." />
        </div>
      ) : (
        <>
          <PanelHeader item={item} onClose={onClose} canEdit={canEdit} />
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <UnderlineTabsList className="px-4">
              <UnderlineTabsTrigger value="overview">Overview</UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="updates">
                Updates
                {comments.data && comments.data.length > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{comments.data.length}</span>}
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="activity">Activity</UnderlineTabsTrigger>
            </UnderlineTabsList>
            <TabsContent value="overview" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <Overview key={item.id} item={item} />
            </TabsContent>
            <TabsContent value="updates" className="min-h-0 flex-1">
              <ItemUpdates itemId={item.id} canComment={canEdit} />
            </TabsContent>
            <TabsContent value="activity" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4">
              <ItemActivity itemId={item.id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </aside>
  );
}

function PanelHeader({ item, onClose, canEdit }: { item: Item; onClose: () => void; canEdit: boolean }) {
  const { model, mutations, openItem, board } = useBoardContext();
  const ws = useWorkspace();
  const [renaming, setRenaming] = React.useState(false);
  const group = model.groups.find((g) => g.id === item.groupId);
  const parent = item.parentItemId ? model.itemById.get(item.parentItemId) : null;
  const creator = ws.userById(item.createdBy);
  return (
    <div className="border-b px-4 pt-3 pb-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-2xs text-muted-foreground">
            <span className="truncate">{board.name}</span>
            {group && (
              <>
                <span aria-hidden>/</span>
                <span className="truncate">{group.name}</span>
              </>
            )}
            {parent && (
              <>
                <span aria-hidden>/</span>
                <button type="button" className="truncate hover:text-foreground hover:underline" onClick={() => openItem(parent.id)}>
                  {parent.name}
                </button>
              </>
            )}
          </p>
          <h2 className="mt-0.5 text-base font-semibold leading-snug">
            <InlineEdit
              value={item.name}
              editing={renaming}
              onEditingChange={setRenaming}
              onSubmit={(name) => void mutations.renameItem(item.id, name)}
              disabled={!canEdit}
              ariaLabel="Item name"
              className={cn("-mx-1 whitespace-normal rounded px-1", canEdit && "hover:bg-accent")}
              inputClassName="h-8 text-base font-semibold"
            />
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel" data-testid="close-panel">
          <X />
        </Button>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
        <UserAvatar user={creator} size="xs" tooltip={false} />
        Created by {creator?.firstName ?? "someone"} <RelativeTime iso={item.createdAt} />
      </p>
    </div>
  );
}

function Overview({ item }: { item: Item }) {
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const [description, setDescription] = React.useState(item.description ?? "");
  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const [newSub, setNewSub] = React.useState("");
  const filesColumn = model.columns.find((c) => c.type === "FILES") ?? null;
  const fieldColumns = model.columns.filter((c) => c.type !== "FILES" && c.type !== "LONG_TEXT");
  const longTextColumns = model.columns.filter((c) => c.type === "LONG_TEXT");

  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-1.5 label-quiet">Description</h3>
        {canEdit ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if ((description.trim() || null) !== (item.description ?? null)) void mutations.updateDescription(item.id, description);
            }}
            placeholder="Add a description, brief or links…"
            rows={3}
            aria-label="Description"
            className="resize-y"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{item.description || <span className="text-muted-foreground">No description.</span>}</p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 label-quiet">Fields</h3>
        <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
          {fieldColumns.map((column) => (
            <div key={column.id} className="flex h-10 items-center">
              <span className="w-32 shrink-0 truncate px-3 text-[13px] text-muted-foreground">{column.name}</span>
              <div className="flex h-8 min-w-0 flex-1 items-center [&>*]:border-r-0">
                <CellRenderer
                  item={item}
                  column={column}
                  width={FIELD_WIDTH}
                  value={model.getValue(item.id, column.id)}
                  onChange={(value) => void mutations.setValue(item, column, value)}
                  readOnly={!canEdit}
                  isDone={model.isDone(item.id)}
                />
              </div>
            </div>
          ))}
        </div>
        {longTextColumns.map((column) => {
          const v = model.getValue(item.id, column.id);
          const text = v?.type === "LONG_TEXT" ? v.text : "";
          return (
            <LongTextField key={`${column.id}:${text}`} column={column} text={text} canEdit={canEdit} onSave={(next) => void mutations.setValue(item, column, { type: "LONG_TEXT", text: next })} />
          );
        })}
      </section>

      <LinkedItemsSection item={item} />

      {item.parentItemId === null && (
        <section>
          <h3 className="mb-1.5 flex items-center justify-between label-quiet">
            Subitems <span className="tabular">{subitems.length}</span>
          </h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
            {subitems.map((sub) => {
              const done = model.isDone(sub.id);
              const statusColumn = model.statusColumn;
              const owners = model.personColumns.flatMap((c) => {
                const v = model.getValue(sub.id, c.id);
                return v?.type === "PERSON" ? v.userIds : [];
              });
              return (
                <li key={sub.id} className="flex h-9 items-center gap-2 px-2 text-[13px]">
                  <CornerDownRight className="size-3 text-muted-foreground/60" />
                  <button type="button" onClick={() => openItem(sub.id)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", done && "text-muted-foreground line-through")}>
                    {sub.name}
                  </button>
                  <SubOwners userIds={owners} />
                  {statusColumn && (
                    <div className="h-7 w-32 [&>*]:border-r-0">
                      <CellRenderer item={sub} column={statusColumn} width={128} value={model.getValue(sub.id, statusColumn.id)} onChange={(value) => void mutations.setValue(sub, statusColumn, value)} readOnly={!canEdit} />
                    </div>
                  )}
                </li>
              );
            })}
            {canEdit && (
              <li className="flex h-9 items-center gap-2 px-2">
                <Plus className="size-3.5 text-muted-foreground/60" />
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSub.trim()) {
                      void mutations.createItem({ groupId: item.groupId, parentItemId: item.id, name: newSub });
                      setNewSub("");
                    }
                  }}
                  placeholder="Add subitem"
                  aria-label="Add subitem"
                  className="h-7 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
                />
              </li>
            )}
            {subitems.length === 0 && !canEdit && <li className="px-3 py-2 text-[13px] text-muted-foreground">No subitems.</li>}
          </ul>
        </section>
      )}

      <FilesSection item={item} column={filesColumn} />
    </div>
  );
}

function SubOwners({ userIds }: { userIds: string[] }) {
  const ws = useWorkspace();
  const users = userIds.map((id) => ws.userById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  if (users.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {users.slice(0, 3).map((u) => (
        <UserAvatar key={u.id} user={u} size="xs" />
      ))}
    </span>
  );
}

function LongTextField({ column, text, canEdit, onSave }: { column: BoardColumn; text: string; canEdit: boolean; onSave: (text: string) => void }) {
  const [draft, setDraft] = React.useState(text);
  return (
    <div className="mt-3">
      <p className="mb-1 text-[13px] text-muted-foreground">{column.name}</p>
      {canEdit ? (
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== text && onSave(draft)} rows={3} aria-label={column.name} />
      ) : (
        <p className="whitespace-pre-wrap text-[13px]">{text || <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesSection({ item, column }: { item: Item; column: BoardColumn | null }) {
  const { model, mutations, canEdit } = useBoardContext();
  const ws = useWorkspace();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const value = column ? model.getValue(item.id, column.id) : undefined;
  const files = value?.type === "FILES" ? value.files : [];

  const addFiles = (list: FileList | null) => {
    if (!list || !column) return;
    const next: AttachmentMeta[] = Array.from(list).map((file) => ({
      id: newId(),
      filename: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      // Local placeholder. Future: upload to Supabase Storage bucket "workspace-files" and store the object path.
      url: `local://attachments/${file.name}`,
      uploadedBy: ws.currentUser.id,
      uploadedAt: nowIso(),
    }));
    void mutations.setValue(item, column, { type: "FILES", files: [...files, ...next] });
  };

  const remove = (id: string) => {
    if (!column) return;
    void mutations.setValue(item, column, { type: "FILES", files: files.filter((f) => f.id !== id) });
  };

  return (
    <section>
      <h3 className="mb-1.5 flex items-center justify-between label-quiet">
        Files
        {column && canEdit && (
          <>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} aria-label="Attach files" />
            <Button variant="ghost" size="sm" className="-my-1 h-6 normal-case tracking-normal" onClick={() => inputRef.current?.click()}>
              <Paperclip /> Attach
            </Button>
          </>
        )}
      </h3>
      {!column ? (
        <p className="text-[13px] text-muted-foreground">Add a Files column to this board to attach files to items.</p>
      ) : files.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No files attached. Attachments are stored as metadata only in local mode.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
          {files.map((file) => (
            <li key={file.id} className="group flex h-10 items-center gap-2 px-3 text-[13px]">
              <FileText className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.filename}</span>
              <span className="text-2xs text-muted-foreground tabular">{formatBytes(file.size)}</span>
              {canEdit && (
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${file.filename}`} className="opacity-0 group-hover:opacity-100" onClick={() => remove(file.id)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemActivity({ itemId }: { itemId: string }) {
  const activity = useItemActivity(itemId);
  if (activity.isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
      </div>
    );
  }
  return <ActivityFeed activities={activity.data ?? []} className="divide-y py-2" emptyTitle="No activity recorded for this item yet." />;
}
