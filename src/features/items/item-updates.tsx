"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Link2, Maximize2, MessageSquare, Minimize2, Pencil, Reply, Send, SmilePlus, Trash2 } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { RichText } from "@/components/shared/rich-text";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { COMMENT_REACTIONS, groupReactions, type Comment } from "@/domain";
import { useCommentMutations, useComments } from "@/features/comments/hooks";
import { useItemLinks } from "@/features/items/link-hooks";
import { Mention, useMentionLinks } from "@/features/workspace/mention-link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canDeleteComment, canEditComment } from "@/lib/permissions/permissions";
import { richTextToPlain } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

export function ItemUpdates({ itemId, canComment }: { itemId: string; canComment: boolean }) {
  const ws = useWorkspace();
  const comments = useComments(itemId);
  const { add, edit, reply, remove, react } = useCommentMutations(itemId);
  const links = useItemLinks(itemId);
  const linkedCount = links.data?.length ?? 0;
  // Default on: if a task is linked, an update usually concerns both sides.
  const [alsoLinked, setAlsoLinked] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  // The composer rests as one line with nothing around it, and opens into the
  // full editor, with its toolbar and its button, the moment somebody goes to
  // write. Anything already written keeps it open.
  const [writing, setWriting] = React.useState(false);
  const open = writing || draft.trim().length > 0;
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);
  // Updates newest first; the replies under each, oldest first, as a conversation reads.
  const { updates, repliesTo } = React.useMemo(() => {
    const all = comments.data ?? [];
    const top = all.filter((c) => !c.parentId);
    const byParent = new Map<string, Comment[]>();
    for (const c of all) if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    return { updates: [...top].reverse(), repliesTo: byParent };
  }, [comments.data]);
  // Conversations folded to one line. Per visit, not stored: a panel reopened later starts open.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
  const allCollapsed = updates.length > 0 && updates.every((u) => collapsed.has(u.id));
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!draft.trim()) return;
    add.mutate({ body: draft.trim(), alsoLinked: linkedCount > 0 && alsoLinked });
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      {canComment && (
        <form
          className={cn("border-b transition-[padding] duration-200", open ? "p-4" : "px-4 py-3")}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onFocus={() => setWriting(true)}
          onBlur={(e) => {
            // Leaving for something inside the composer (the toolbar, the
            // switch) is still writing; leaving it altogether with nothing
            // written puts it back to rest.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setWriting(false);
          }}
          data-open={open || undefined}
          data-testid="comment-composer"
        >
          <div className={cn("flex gap-2.5", !open && "items-center")}>
            <UserAvatar user={ws.currentUser} size={open ? "md" : "sm"} tooltip={false} />
            <div className={cn("min-w-0 flex-1", open && "space-y-2")}>
              <RichTextEditor
                compact={!open}
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                people={ws.activeUsers}
                placeholder="Write an update… type @ to mention a teammate"
                ariaLabel="New update"
                testId="comment-input"
              />
              <div className={cn("flex flex-wrap items-center justify-end gap-2.5", !open && "hidden")}>
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
        {comments.data && updates.length === 0 && <EmptyState icon={MessageSquare} title="No updates yet" description="Post the first update to start the conversation." compact />}
        {updates.length > 1 && (
          <div className="mb-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-2xs text-muted-foreground"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(updates.map((u) => u.id)))}
              data-testid="comments-collapse-all"
            >
              {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />} {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
          </div>
        )}
        <ul className="space-y-3">
          {updates.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              names={names}
              onEdit={(body) => edit.mutate({ id: comment.id, body })}
              onDelete={() => remove.mutate(comment)}
              replies={repliesTo.get(comment.id) ?? []}
              canReply={canComment}
              onReply={(body) => reply.mutate({ parentId: comment.id, body })}
              onEditReply={(id, body) => edit.mutate({ id, body })}
              onDeleteReply={(target) => remove.mutate(target)}
              collapsed={collapsed.has(comment.id)}
              onToggle={() => toggle(comment.id)}
              onReact={canComment ? (target, emoji, on) => react.mutate({ comment: target, emoji, on }) : undefined}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Past this many replies, the earlier ones fold behind "Show N earlier replies". */
const REPLIES_SHOWN = 3;

/**
 * One update, the way monday shows them: a card with the update on top, a
 * line of actions under it, the replies inside the card on a quieter ground,
 * and a "Write a reply…" box closing it. Replies are one level deep.
 */
function CommentItem({
  comment,
  names,
  onEdit,
  onDelete,
  replies = [],
  canReply = false,
  onReply,
  onEditReply,
  onDeleteReply,
  collapsed = false,
  onToggle,
  onReact,
}: {
  comment: Comment;
  names: string[];
  onEdit: (body: string) => void;
  onDelete: () => void;
  replies?: Comment[];
  canReply?: boolean;
  onReply?: (body: string) => void;
  onEditReply?: (id: string, body: string) => void;
  onDeleteReply?: (reply: Comment) => void;
  /** Folded to one line: who, the start of what they said, and how many replied. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Gives or takes back the viewer's emoji on this update or one of its replies. Absent where nobody may react. */
  onReact?: ReactHandler;
}) {
  const [replying, setReplying] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  // A long thread shows its latest few; the rest wait behind a line.
  const [showAll, setShowAll] = React.useState(false);
  const hidden = showAll ? 0 : Math.max(0, replies.length - REPLIES_SHOWN);
  const shown = replies.slice(hidden);
  const toggleButton = onToggle && (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={collapsed ? "Expand this conversation" : "Collapse this conversation"}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="text-muted-foreground"
      data-testid="comment-collapse"
    >
      <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
    </Button>
  );

  if (collapsed) {
    return (
      <li className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs" data-testid="comment" data-collapsed="true">
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-accent/40">
          <ChevronDown className="size-3.5 shrink-0 -rotate-90 text-muted-foreground" />
          <CommentAuthorName comment={comment} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{richTextToPlain(comment.body)}</span>
          <ReactionSummary comment={comment} />
          {replies.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground tabular">
              <MessageSquare className="size-3" /> {replies.length}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs" data-testid="comment">
      <div className="group/comment px-4 pt-3.5 pb-1.5">
        <CommentHeader comment={comment} size="md" onEdit={() => setEditing(true)} onDelete={onDelete} leading={toggleButton} />
        <CommentBody comment={comment} names={names} editing={editing} onEditingChange={setEditing} onSave={onEdit} className="mt-2 pl-[2.625rem]" />
        {/* The actions under an update, as monday has them: a rule, then Reply, then how many there are. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-border/50 pt-1.5">
          {canReply && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-2xs text-muted-foreground" onClick={() => setReplying(true)} data-testid="comment-reply-open">
              <Reply className="size-3.5" /> Reply
            </Button>
          )}
          <Reactions comment={comment} onReact={onReact} />
          {replies.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 px-1 text-2xs text-muted-foreground tabular" data-testid="comment-reply-count">
              <MessageSquare className="size-3" /> {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <ul className="space-y-3 border-t border-border/60 bg-surface/50 px-4 py-3" data-testid="comment-replies">
          {hidden > 0 && (
            <li>
              <button type="button" onClick={() => setShowAll(true)} className="text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid="comment-earlier-replies">
                Show {hidden} earlier {hidden === 1 ? "reply" : "replies"}
              </button>
            </li>
          )}
          {shown.map((reply) => (
            <ReplyRow key={reply.id} reply={reply} names={names} onEdit={(body) => onEditReply?.(reply.id, body)} onDelete={() => onDeleteReply?.(reply)} onReact={onReact} />
          ))}
        </ul>
      )}

      {canReply && (
        <div className="border-t border-border/60 bg-surface/50 px-4 py-2.5">
          {replying ? (
            <ReplyComposer
              onCancel={() => setReplying(false)}
              onSubmit={(body) => {
                onReply?.(body);
                setReplying(false);
              }}
            />
          ) : (
            <ReplyPrompt onOpen={() => setReplying(true)} />
          )}
        </div>
      )}
    </li>
  );
}

/** One reply inside an update's card: smaller, on the card's quieter ground. */
function ReplyRow({ reply, names, onEdit, onDelete, onReact }: { reply: Comment; names: string[]; onEdit: (body: string) => void; onDelete: () => void; onReact?: ReactHandler }) {
  const [editing, setEditing] = React.useState(false);
  return (
    <li className="group/comment" data-testid="comment-reply">
      <CommentHeader comment={reply} size="sm" onEdit={() => setEditing(true)} onDelete={onDelete} />
      <CommentBody comment={reply} names={names} editing={editing} onEditingChange={setEditing} onSave={onEdit} className="mt-1 pl-8" />
      <Reactions comment={reply} onReact={onReact} compact className="mt-1 pl-8" />
    </li>
  );
}

type ReactHandler = (comment: Comment, emoji: string, on: boolean) => void;

/** "You, Linh Tran and 2 others" — who gave one emoji. */
function reactorNames(userIds: readonly string[], meId: string, nameOf: (id: string) => string): string {
  const names = [...userIds].sort((a, b) => (a === meId ? -1 : b === meId ? 1 : 0)).map((id) => (id === meId ? "You" : nameOf(id)));
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * The reactions on an update or a reply: one chip per emoji with how many gave
 * it, the viewer's own marked, and a button to add one. Clicking a chip gives
 * that emoji too, or takes the viewer's back.
 *
 * On a reply the add button waits for the pointer, as the edit and delete
 * buttons do, so a thread of replies does not carry a row of smileys; an
 * update always shows it, beside Reply.
 */
function Reactions({ comment, onReact, compact = false, className }: { comment: Comment; onReact?: ReactHandler; compact?: boolean; className?: string }) {
  const ws = useWorkspace();
  const me = ws.currentUser.id;
  const groups = groupReactions(comment.reactions);
  if (groups.length === 0 && (!onReact || compact)) {
    // A reply with none yet: only the hover button, on a line of its own.
    return onReact ? (
      <div className={cn("flex h-6 items-center opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100", className)}>
        <ReactionPicker comment={comment} onReact={onReact} compact />
      </div>
    ) : null;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid="comment-reactions">
      {groups.map(({ emoji, userIds }) => {
        const mine = userIds.includes(me);
        return (
          <SimpleTooltip key={emoji} label={`${reactorNames(userIds, me, (id) => ws.userById(id)?.displayName ?? "Someone")} reacted ${emoji}`}>
            <button
              type="button"
              disabled={!onReact}
              onClick={() => onReact?.(comment, emoji, !mine)}
              aria-pressed={mine}
              aria-label={`${emoji} ${userIds.length}${mine ? ", including you" : ""}`}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tabular transition-colors disabled:cursor-default",
                mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-background text-muted-foreground enabled:hover:border-border enabled:hover:bg-accent/60",
              )}
              data-testid="comment-reaction"
            >
              <span className="text-[13px] leading-none">{emoji}</span>
              <span className="text-2xs font-medium">{userIds.length}</span>
            </button>
          </SimpleTooltip>
        );
      })}
      {onReact && <ReactionPicker comment={comment} onReact={onReact} compact={compact} />}
    </div>
  );
}

/** The six reactions on offer, in a small popover. One already given is marked, and choosing it takes it back. */
function ReactionPicker({ comment, onReact, compact }: { comment: Comment; onReact: ReactHandler; compact?: boolean }) {
  const ws = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const mine = new Set((comment.reactions ?? []).filter((r) => r.userId === ws.currentUser.id).map((r) => r.emoji));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SimpleTooltip label="Add reaction">
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Add reaction" className={cn("text-muted-foreground", compact ? "size-6" : "size-7")} data-testid="comment-reaction-add">
            <SmilePlus className="size-3.5" />
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent align="start" side="top" className="flex w-auto gap-0.5 rounded-full p-1" data-testid="comment-reaction-picker">
        {COMMENT_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onReact(comment, emoji, !mine.has(emoji));
              setOpen(false);
            }}
            aria-label={mine.has(emoji) ? `Remove ${emoji}` : `React ${emoji}`}
            aria-pressed={mine.has(emoji)}
            className={cn("flex size-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-accent", mine.has(emoji) && "bg-primary/10")}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A collapsed update's reactions, as a quiet tally beside its reply count. */
function ReactionSummary({ comment }: { comment: Comment }) {
  const groups = groupReactions(comment.reactions);
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, g) => sum + g.userIds.length, 0);
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground tabular">
      {groups.slice(0, 3).map((g) => (
        <span key={g.emoji} className="text-xs leading-none">
          {g.emoji}
        </span>
      ))}
      <span className="ml-0.5">{total}</span>
    </span>
  );
}

/** Who wrote it and when, with edit and delete for whoever may. */
function CommentHeader({ comment, size, onEdit, onDelete, leading }: { comment: Comment; size: "sm" | "md"; onEdit: () => void; onDelete: () => void; leading?: React.ReactNode }) {
  const ws = useWorkspace();
  const links = useMentionLinks();
  const author = ws.userById(comment.authorId);
  const edited = comment.updatedAt !== comment.createdAt;
  const noun = comment.parentId ? "reply" : "update";
  return (
    <div className={cn("flex items-center", size === "md" ? "gap-2.5" : "gap-2")}>
      <UserAvatar user={author} size={size} tooltip={false} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-[13px]">
        <Mention href={links.person(comment.authorId)}>{author?.displayName ?? "Unknown"}</Mention>
        <RelativeTime iso={comment.createdAt} className="text-2xs text-muted-foreground" />
        {edited && <span className="text-2xs text-muted-foreground">(edited)</span>}
        {comment.sharedId && (
          <SimpleTooltip label="Posted on the linked task as well — editing changes both">
            <span className="flex items-center gap-1 rounded-full bg-surface-strong px-1.5 py-0.5 text-2xs font-medium text-muted-foreground" data-testid="comment-linked-badge">
              <Link2 className="size-3" /> Linked
            </span>
          </SimpleTooltip>
        )}
      </div>
      <span className="flex shrink-0 items-center opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-confirming]]:opacity-100">
        {canEditComment(ws.permissions, comment) && (
          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${noun}`} onClick={onEdit}>
            <Pencil />
          </Button>
        )}
        {canDeleteComment(ws.permissions, comment) && (
          <ConfirmDelete label={`Delete ${noun}`} onConfirm={onDelete} />
        )}
      </span>
      {leading}
    </div>
  );
}

/** How long the "Delete?" badge waits for its second click before standing down. */
const CONFIRM_MS = 4000;

/**
 * Delete in two clicks without a dialog: the bin turns into a small red
 * "Delete?" badge where it stood, and a second click on the badge deletes.
 * Clicking elsewhere, Escape or a few seconds' wait puts the bin back.
 */
function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = React.useState(false);
  const badge = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!confirming) return;
    badge.current?.focus();
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  if (!confirming) {
    return (
      <Button variant="ghost" size="icon-xs" aria-label={label} className="hover:text-destructive" onClick={() => setConfirming(true)} data-testid="comment-delete">
        <Trash2 />
      </Button>
    );
  }
  return (
    <button
      ref={badge}
      type="button"
      onClick={() => {
        setConfirming(false);
        onConfirm();
      }}
      onBlur={() => setConfirming(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setConfirming(false);
      }}
      aria-label={`${label}: press again to confirm`}
      className="inline-flex h-6 items-center gap-1 rounded-full bg-destructive px-2 text-2xs font-medium text-white shadow-sm animate-in fade-in-0 zoom-in-95"
      data-confirming=""
      data-testid="comment-delete-confirm"
    >
      <Trash2 className="size-3" /> Delete?
    </button>
  );
}

/** A small avatar and the name, for the folded line. */
function CommentAuthorName({ comment }: { comment: Comment }) {
  const ws = useWorkspace();
  const author = ws.userById(comment.authorId);
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium">
      <UserAvatar user={author} size="xs" tooltip={false} />
      {author?.displayName ?? "Unknown"}
    </span>
  );
}

/** What was written, or the editor for it while it is being changed. */
function CommentBody({
  comment,
  names,
  editing,
  onEditingChange,
  onSave,
  className,
}: {
  comment: Comment;
  names: string[];
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (body: string) => void;
  className?: string;
}) {
  const ws = useWorkspace();
  const links = useMentionLinks();
  const [draft, setDraft] = React.useState(comment.body);
  const save = () => {
    if (draft.trim()) onSave(draft.trim());
    onEditingChange(false);
  };
  if (!editing) return <RichText body={comment.body} mentionNames={names} className={cn("leading-relaxed", className)} mentionHref={links.personNamed} />;
  return (
    <form
      className={cn("space-y-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <RichTextEditor value={draft} onChange={setDraft} onSubmit={save} people={ws.activeUsers} ariaLabel="Edit update" testId="comment-edit-input" autoFocus />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(comment.body);
            onEditingChange(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** The resting "Write a reply…" line at the foot of every update. */
function ReplyPrompt({ onOpen }: { onOpen: () => void }) {
  const ws = useWorkspace();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      data-testid="comment-reply-prompt"
    >
      <UserAvatar user={ws.currentUser} size="xs" tooltip={false} />
      Write a reply…
    </button>
  );
}

/**
 * Answering an update: a plain box by default — a reply is usually a line —
 * that opens into the full editor, toolbar and all, for one that is not.
 */
function ReplyComposer({ onSubmit, onCancel }: { onSubmit: (body: string) => void; onCancel: () => void }) {
  const ws = useWorkspace();
  const [draft, setDraft] = React.useState("");
  const [full, setFull] = React.useState(false);
  const send = () => {
    if (draft.trim()) onSubmit(draft.trim());
  };
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !draft.trim()) onCancel();
      }}
      data-testid="comment-reply-composer"
    >
      <UserAvatar user={ws.currentUser} size="sm" tooltip={false} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <RichTextEditor compact={!full} value={draft} onChange={setDraft} onSubmit={send} people={ws.activeUsers} placeholder="Write a reply… type @ to mention" ariaLabel="Reply" testId="comment-reply-input" autoFocus />
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-2xs text-muted-foreground" onClick={() => setFull((v) => !v)} data-testid="comment-reply-expand">
            {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />} {full ? "Basic editor" : "Full editor"}
          </Button>
          <span className="ml-auto" />
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-7" disabled={!draft.trim()} data-testid="comment-reply-submit">
            <Send /> Reply
          </Button>
        </div>
      </div>
    </form>
  );
}
