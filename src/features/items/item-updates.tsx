"use client";

import { AtSign, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Comment } from "@/domain";
import { useCommentMutations, useComments } from "@/features/comments/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canDeleteComment, canEditComment } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/** Renders @Full Name mentions as highlighted chips. */
function renderBody(body: string, names: string[]): React.ReactNode {
  if (names.length === 0) return body;
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return body.split(pattern).map((part, i) =>
    part.startsWith("@") && names.includes(part.slice(1)) ? (
      <span key={i} className="rounded bg-blue-50 px-1 font-medium text-blue-700">
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function ItemUpdates({ itemId, canComment }: { itemId: string; canComment: boolean }) {
  const ws = useWorkspace();
  const comments = useComments(itemId);
  const { add, edit, remove } = useCommentMutations(itemId);
  const [draft, setDraft] = React.useState("");
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);

  const insertMention = (name: string) => {
    const el = textareaRef.current;
    const insertion = `@${name} `;
    if (!el) {
      setDraft((d) => d + insertion);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${insertion}${draft.slice(end)}`;
    setDraft(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  };

  const submit = () => {
    if (!draft.trim()) return;
    add.mutate(draft.trim());
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
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Write an update… use @ to mention a teammate"
                rows={3}
                aria-label="New update"
                data-testid="comment-input"
              />
              <div className="flex items-center justify-between">
                <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" aria-label="Mention someone">
                      <AtSign /> Mention
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-0">
                    <Command>
                      <CommandInput placeholder="Who?" autoFocus />
                      <CommandList className="max-h-56">
                        <CommandEmpty>No one found.</CommandEmpty>
                        <CommandGroup>
                          {ws.users
                            .filter((u) => u.deactivatedAt === null)
                            .map((u) => (
                              <CommandItem key={u.id} value={u.displayName} onSelect={() => insertMention(u.displayName)}>
                                <UserAvatar user={u} size="xs" tooltip={false} /> {u.displayName}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-muted-foreground">Ctrl/⌘ + Enter</span>
                  <Button type="submit" size="sm" disabled={!draft.trim() || add.isPending} data-testid="comment-submit">
                    <Send /> Update
                  </Button>
                </div>
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
            <CommentItem key={comment.id} comment={comment} names={names} onEdit={(body) => edit.mutate({ id: comment.id, body })} onDelete={() => remove.mutate(comment.id)} />
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
            <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit update" />
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
          <p className={cn("mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed")}>{renderBody(comment.body, names)}</p>
        )}
      </div>
    </li>
  );
}
