"use client";

import { Link2, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { RichText } from "@/components/shared/rich-text";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Comment } from "@/domain";
import { useCommentMutations, useComments } from "@/features/comments/hooks";
import { useItemLinks } from "@/features/items/link-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canDeleteComment, canEditComment } from "@/lib/permissions/permissions";

export function ItemUpdates({ itemId, canComment }: { itemId: string; canComment: boolean }) {
  const ws = useWorkspace();
  const comments = useComments(itemId);
  const { add, edit, remove } = useCommentMutations(itemId);
  const links = useItemLinks(itemId);
  const linkedCount = links.data?.length ?? 0;
  // Default on: if a task is linked, an update usually concerns both sides.
  const [alsoLinked, setAlsoLinked] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);

  const submit = () => {
    if (!draft.trim()) return;
    add.mutate({ body: draft.trim(), alsoLinked: linkedCount > 0 && alsoLinked });
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      {canComment && (
        <form
          className="border-b p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-2.5">
            <UserAvatar user={ws.currentUser} size="md" tooltip={false} />
            <div className="min-w-0 flex-1 space-y-2">
              <RichTextEditor
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                people={ws.users}
                placeholder="Write an update… type @ to mention a teammate"
                ariaLabel="New update"
                testId="comment-input"
              />
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {linkedCount > 0 && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground" title="Post this update on the linked task too">
                    <Link2 className="size-3.5" />
                    <span className="hidden sm:inline">Post to {linkedCount === 1 ? "linked task" : `${linkedCount} linked tasks`}</span>
                    <span className="sm:hidden">Linked</span>
                    <Switch
                      size="sm"
                      checked={alsoLinked}
                      onCheckedChange={setAlsoLinked}
                      aria-label="Also post this update to linked tasks"
                      data-testid="comment-also-linked"
                    />
                  </label>
                )}
                <span className="text-2xs text-muted-foreground">Ctrl/⌘ + Enter</span>
                <Button type="submit" size="sm" disabled={!draft.trim() || add.isPending} data-testid="comment-submit">
                  <Send /> Update
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {comments.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        )}
        {comments.data && comments.data.length === 0 && <EmptyState icon={MessageSquare} title="No updates yet" description="Post the first update to start the conversation." compact />}
        <ul className="space-y-4">
          {[...(comments.data ?? [])].reverse().map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              names={names}
              onEdit={(body) => edit.mutate({ id: comment.id, body })}
              onDelete={() => remove.mutate(comment.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CommentItem({ comment, names, onEdit, onDelete }: { comment: Comment; names: string[]; onEdit: (body: string) => void; onDelete: () => void }) {
  const ws = useWorkspace();
  const author = ws.userById(comment.authorId);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(comment.body);
  const edited = comment.updatedAt !== comment.createdAt;
  return (
    <li className="group flex gap-2.5" data-testid="comment">
      <UserAvatar user={author} size="md" tooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-medium">{author?.displayName ?? "Unknown"}</span>
          <RelativeTime iso={comment.createdAt} className="text-2xs text-muted-foreground" />
          {edited && <span className="text-2xs text-muted-foreground">(edited)</span>}
          {comment.sharedId && (
            <SimpleTooltip label="Posted on the linked task as well — editing changes both">
              <span
                className="flex items-center gap-1 rounded-full bg-surface-strong px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
                data-testid="comment-linked-badge"
              >
                <Link2 className="size-3" /> Linked
              </span>
            </SimpleTooltip>
          )}
          <span className="ml-auto flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            {canEditComment(ws.permissions, comment) && (
              <Button variant="ghost" size="icon-xs" aria-label="Edit update" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
            )}
            {canDeleteComment(ws.permissions, comment) && (
              <Button variant="ghost" size="icon-xs" aria-label="Delete update" className="hover:text-destructive" onClick={onDelete}>
                <Trash2 />
              </Button>
            )}
          </span>
        </div>
        {editing ? (
          <form
            className="mt-1 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onEdit(draft.trim());
              setEditing(false);
            }}
          >
            <RichTextEditor
              value={draft}
              onChange={setDraft}
              onSubmit={() => {
                if (draft.trim()) onEdit(draft.trim());
                setEditing(false);
              }}
              people={ws.users}
              ariaLabel="Edit update"
              testId="comment-edit-input"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <RichText body={comment.body} mentionNames={names} className="mt-0.5 leading-relaxed" />
        )}
      </div>
    </li>
  );
}
