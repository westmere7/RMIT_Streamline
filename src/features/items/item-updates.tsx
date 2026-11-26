"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Link2, ListChecks, Maximize2, MessageSquare, Minimize2, Pencil, Pin, PinOff, Reply, Send, SmilePlus, Trash2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { createPortal } from "react-dom";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { RichText } from "@/components/shared/rich-text";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { PersonName, UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { COMMENT_REACTIONS, LINK_FIELD_UPDATES, groupReactions, orderUpdates, overviewPinOf, pinStateOf, threadPinOf, type Activity, type Comment, type CommentPinState } from "@/domain";
import { describeActivity } from "@/features/activity/format-activity";
import { useCommentMutations, useComments } from "@/features/comments/hooks";
import { mergeFeed, type FeedEntry, type FeedOrder } from "@/features/items/item-feed";
import { useItemLinks } from "@/features/items/link-hooks";
import { Mention, useMentionLinks } from "@/features/workspace/mention-link";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canDeleteComment, canEditComment } from "@/lib/permissions/permissions";
import { formatRelative } from "@/lib/dates/dates";
import { checklistKeys, richTextToPlain } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Who may delete a given update here: worked out once for the task's board, read by every header. */
const DeleteRule = React.createContext<(comment: Comment) => boolean>(() => false);

/** Ticks a checklist box on an update or a reply. Absent where the reader may not work on the task. */
type CheckHandler = (comment: Comment, key: string, on: boolean) => void;
const CheckToggle = React.createContext<CheckHandler | undefined>(undefined);

/** Pins an update or takes its pin away. Absent where the reader may not work on the task. */
type PinHandler = (comment: Comment, state: CommentPinState) => void;
const PinControl = React.createContext<PinHandler | undefined>(undefined);
/** Pin to overview offered and named. Off in the pop-up, where the overview's pinned copy would sit beside the update itself. */
const OverviewPins = React.createContext(true);

/**
 * @param log The task's history, woven in among the updates by time (the
 * pop-up's one feed). Its "update posted" lines are left out: the update is there.
 * @param embedded Inside a parent that scrolls: no height or scroll of its own.
 */
export function ItemUpdates({
  itemId,
  canComment,
  log,
  embedded = false,
  order = "time",
  fadeLog = true,
  composerTop,
  overviewPins = true,
  collapseSlot,
}: {
  itemId: string;
  canComment: boolean;
  log?: readonly Activity[];
  embedded?: boolean;
  /** The feed by time, or every update above the history. */
  order?: FeedOrder;
  /** History lines faded back behind the updates. */
  fadeLog?: boolean;
  /** Embedded: the composer stays put this far from the top of the scroll, under the parent's tab bar. */
  composerTop?: string;
  /** Pin to overview on offer (and named on the badge). */
  overviewPins?: boolean;
  /** Where Collapse all goes, as an icon, instead of a row above the feed. */
  collapseSlot?: HTMLElement | null;
}) {
  const ws = useWorkspace();
  const services = useServices();
  const item = useQuery({ queryKey: ["item-board", itemId], queryFn: () => services.repos.items.getById(itemId), staleTime: 60_000 });
  const board = item.data ? ws.boardById(item.data.boardId) ?? null : null;
  const mayDelete = React.useCallback((comment: Comment) => canDeleteComment(ws.permissions, comment, board), [ws.permissions, board]);
  const comments = useComments(itemId);
  const { add, edit, reply, remove, react, check, pin } = useCommentMutations(itemId);
  const onCheck = React.useCallback<CheckHandler>((comment, key, on) => check.mutate({ comment, key, on }), [check]);
  const onPin = React.useCallback<PinHandler>((comment, state) => pin.mutate({ comment, state }), [pin]);
  const links = useItemLinks(itemId);
  // Only links that carry updates (What stays in sync → Updates and replies).
  const linkedCount = (links.data ?? []).filter((view) => !view.link.excluded.includes(LINK_FIELD_UPDATES)).length;
  // Default on: if a task is linked, an update usually concerns both sides.
  const [alsoLinked, setAlsoLinked] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  // The composer rests as one line with nothing around it, and opens into the
  // full editor, with its toolbar and its button, the moment somebody goes to
  // write. Anything already written keeps it open.
  const [writing, setWriting] = React.useState(false);
  const open = writing || draft.trim().length > 0;
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);
  // Pinned updates first, then the rest newest first; the replies under each, oldest first, as a conversation reads.
  const { updates, repliesTo } = React.useMemo(() => {
    const all = comments.data ?? [];
    const top = all.filter((c) => !c.parentId);
    const byParent = new Map<string, Comment[]>();
    for (const c of all) if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    // A pinned reply lifts its conversation to the top, and stays in it.
    return { updates: orderUpdates(top, (u) => threadPinOf(u, byParent.get(u.id))), repliesTo: byParent };
  }, [comments.data]);
  // The feed: pinned conversations first, then updates and history lines
  // together, newest first, each update where it was posted.
  const feed = React.useMemo(
    (): FeedEntry[] => (log ? mergeFeed(updates, log, order, (u) => threadPinOf(u, repliesTo.get(u.id)) != null) : updates.map((comment) => ({ kind: "update", comment }))),
    [log, updates, order, repliesTo],
  );
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
    <DeleteRule.Provider value={mayDelete}>
    <PinControl.Provider value={canComment ? onPin : undefined}>
    <OverviewPins.Provider value={overviewPins}>
    <CheckToggle.Provider value={canComment ? onCheck : undefined}>
    <div className={cn("flex flex-col", !embedded && "h-full")}>
      {canComment && (
        <form
          className={cn("border-b transition-[padding] duration-200", embedded ? (open ? "px-8 py-4" : "px-8 py-3.5") : open ? "p-4" : "px-4 py-3", embedded && composerTop && "sticky z-[9] bg-popover")}
          style={embedded && composerTop ? { top: composerTop } : undefined}
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
                checklist
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
      <div className={cn(embedded ? "px-8 py-5" : "scrollbar-thin flex-1 overflow-y-auto p-4")}>
        {comments.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        )}
        {comments.data && feed.length === 0 && <EmptyState icon={MessageSquare} title="No updates yet" description="Post the first update to start the conversation." compact />}
        {/* Given a slot (the pop-up's tab bar), the button goes there as an icon rather than taking a row of its own. */}
        {updates.length > 1 && collapseSlot &&
          createPortal(
            <SimpleTooltip label={allCollapsed ? "Expand all" : "Collapse all"}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={allCollapsed ? "Expand all" : "Collapse all"}
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(updates.map((u) => u.id)))}
                data-testid="comments-collapse-all"
              >
                {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
              </Button>
            </SimpleTooltip>,
            collapseSlot,
          )}
        {updates.length > 1 && !collapseSlot && (
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
        <ul className="space-y-3" data-testid={log ? "item-feed" : undefined}>
          {feed.map((entry) => {
            if (entry.kind === "log") return <LogLine key={`log-${entry.activity.id}`} activity={entry.activity} faded={fadeLog} />;
            const comment = entry.comment;
            return (
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
            );
          })}
        </ul>
      </div>
    </div>
    </CheckToggle.Provider>
    </OverviewPins.Provider>
    </PinControl.Provider>
    </DeleteRule.Provider>
  );
}

/** One line of the task's history among its updates: who did what, and when. Quieter than an update. */
function LogLine({ activity, faded }: { activity: Activity; faded: boolean }) {
  const ws = useWorkspace();
  const links = useMentionLinks();
  return (
    <li className="flex items-center gap-2.5 px-1 text-[12.5px] leading-snug text-muted-foreground" data-testid="feed-log">
      <UserAvatar user={ws.userById(activity.actorId)} size="xs" />
      {/* Faded back behind the updates; the face stays, so who did it is still found at a glance. */}
      <p className={cn("min-w-0 flex-1", faded && "opacity-55")}>
        {describeActivity(activity, ws.users, false, links)} <RelativeTime iso={activity.createdAt} className="ml-1 text-2xs" />
      </p>
    </li>
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
      // Hover lifts the card (a wash of the text colour and a firmer edge): the
      // accent tint read darker than the card in the dark theme.
      <li className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs transition-colors hover:border-border" data-testid="comment" data-collapsed="true">
        {/* Folded, but still read at a glance: who and when on one line, the start of what they said under it. */}
        <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.04]">
          <ChevronDown className="mt-1 size-3.5 shrink-0 -rotate-90 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <CommentAuthorName comment={comment} size="sm" />
              <RelativeTime iso={comment.createdAt} className="shrink-0 text-2xs text-muted-foreground" />
              {/* Folded, a pinned one still says why it sits on top. */}
              {threadPinOf(comment, replies) && <Pin className="size-3 shrink-0 text-accent-soft-foreground" aria-label="Pinned" data-testid="comment-pinned-mark" />}
              <span className="ml-auto flex shrink-0 items-center gap-3">
                <ChecklistTally comment={comment} />
                <ReactionSummary comment={comment} />
                {replies.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground tabular">
                    <MessageSquare className="size-3" /> {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  </span>
                )}
              </span>
            </span>
            <span className="mt-1.5 line-clamp-2 block pl-8 text-[13px] leading-relaxed text-muted-foreground">{richTextToPlain(comment.body)}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs" data-testid="comment">
      <div className="group/comment px-4 pt-3.5 pb-1.5">
        <CommentHeader comment={comment} size="md" onEdit={() => setEditing(true)} onDelete={onDelete} leading={toggleButton} onHeaderClick={editing ? undefined : onToggle} />
        <CommentBody comment={comment} names={names} editing={editing} onEditingChange={setEditing} onSave={onEdit} className="mt-2 pl-1" />
        {/* The actions under an update, as monday has them: a rule, then Reply, then how many there are. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-border/50 pt-1.5">
          {canReply && (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-2xs text-muted-foreground" onClick={() => setReplying(true)} data-testid="comment-reply-open">
              <Reply className="size-3.5" /> Reply
            </Button>
          )}
          <Reactions comment={comment} onReact={onReact} />
          <span className="ml-auto flex items-center gap-3 px-1">
            <ChecklistTally comment={comment} />
            {replies.length > 0 && (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground tabular" data-testid="comment-reply-count">
                <MessageSquare className="size-3" /> {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* The replies and the box to add one hang off the update by a thread line
          under its avatar, so they read as its conversation rather than as more
          updates on the same card. */}
      {(replies.length > 0 || canReply) && (
        <div className="border-t border-border/60 bg-surface/50 py-3 pr-4 pl-[1.9rem]">
          <div className="space-y-3 border-l-2 border-border/70 pl-4">
            {replies.length > 0 && (
              <ul className="space-y-3" data-testid="comment-replies">
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
            {canReply &&
              (replying ? (
                <ReplyComposer
                  onCancel={() => setReplying(false)}
                  onSubmit={(body) => {
                    onReply?.(body);
                    setReplying(false);
                  }}
                />
              ) : (
                <ReplyPrompt onOpen={() => setReplying(true)} />
              ))}
          </div>
        </div>
      )}
    </li>
  );
}

/** One reply inside an update's card: smaller, on the card's quieter ground. */
function ReplyRow({ reply, names, onEdit, onDelete, onReact }: { reply: Comment; names: string[]; onEdit: (body: string) => void; onDelete: () => void; onReact?: ReactHandler }) {
  const [editing, setEditing] = React.useState(false);
  // No reactions yet: the react button waits in the header with edit and
  // delete, rather than on a line of its own that left every reply with a gap.
  const reacted = groupReactions(reply.reactions).length > 0;
  return (
    <li className="group/comment" data-testid="comment-reply">
      <CommentHeader comment={reply} size="sm" onEdit={() => setEditing(true)} onDelete={onDelete} hoverAction={!reacted && onReact ? <ReactionPicker comment={reply} onReact={onReact} compact /> : undefined} />
      <CommentBody comment={reply} names={names} editing={editing} onEditingChange={setEditing} onSave={onEdit} className="mt-1 pl-8" />
      {reacted && <Reactions comment={reply} onReact={onReact} compact className="mt-1 pl-8" />}
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
      <div className={cn("flex h-6 items-center opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100", className)}>
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
              // A hairline outline and no fill: the emoji and its count, with a faint ground only under the pointer.
              // The viewer's own shows in a slightly stronger line and the count's colour, nothing louder.
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tabular transition-colors enabled:hover:bg-accent/50 disabled:cursor-default",
                mine ? "border-primary/25 text-foreground" : "border-border/50 text-muted-foreground",
              )}
              data-testid="comment-reaction"
            >
              <span className="text-[13px] leading-none">{emoji}</span>
              <span className={cn("text-2xs", mine ? "font-semibold text-primary" : "font-medium")}>{userIds.length}</span>
            </button>
          </SimpleTooltip>
        );
      })}
      {onReact && <ReactionPicker comment={comment} onReact={onReact} compact={compact} />}
    </div>
  );
}

/** The reactions on offer, two rows in a small popover. One already given is marked, and choosing it takes it back. */
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
      <PopoverContent align="start" side="top" className="grid w-auto grid-cols-8 gap-0.5 p-1.5" data-testid="comment-reaction-picker">
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
            className={cn("flex size-8 items-center justify-center rounded-md text-lg transition-transform hover:scale-125 hover:bg-accent", mine.has(emoji) && "bg-accent")}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** How far through its checklists an update is: "2/5", green once every box is ticked. Nothing without one. */
function ChecklistTally({ comment }: { comment: Comment }) {
  const keys = React.useMemo(() => checklistKeys(comment.body), [comment.body]);
  if (keys.length === 0) return null;
  const ticked = new Set((comment.checks ?? []).map((c) => c.key));
  const done = keys.filter((key) => ticked.has(key)).length;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-2xs tabular", done === keys.length ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")} aria-label={`${done} of ${keys.length} ticked`} data-testid="comment-checklist-tally">
      <ListChecks className="size-3" /> {done}/{keys.length}
    </span>
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
function CommentHeader({
  comment,
  size,
  onEdit,
  onDelete,
  leading,
  onHeaderClick,
  hoverAction,
}: {
  comment: Comment;
  size: "sm" | "md";
  onEdit: () => void;
  onDelete: () => void;
  leading?: React.ReactNode;
  /** One more button among the ones that wait for the pointer (a reply's react button). */
  hoverAction?: React.ReactNode;
  /** Clicking the header anywhere but its name and buttons: an update folds this way. */
  onHeaderClick?: () => void;
}) {
  const ws = useWorkspace();
  const showOverviewPins = React.useContext(OverviewPins);
  const links = useMentionLinks();
  const mayDelete = React.useContext(DeleteRule);
  const author = ws.userById(comment.authorId);
  const edited = comment.updatedAt !== comment.createdAt;
  const noun = comment.parentId ? "reply" : "update";
  return (
    <div
      className={cn("flex items-center", size === "md" ? "gap-2.5" : "gap-2", onHeaderClick && "-mx-1 -my-0.5 cursor-pointer rounded-lg px-1 py-0.5")}
      onClick={
        onHeaderClick
          ? (event) => {
              // The name, the buttons and anything else with a click of its own keep it.
              if ((event.target as HTMLElement).closest("a, button, input, [role=menuitem]")) return;
              onHeaderClick();
            }
          : undefined
      }
      data-testid={onHeaderClick ? "comment-header" : undefined}
    >
      <UserAvatar user={author} size={size} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-[13px]">
        <PersonName user={author}>
          <Mention href={links.person(comment.authorId)}>{author?.displayName ?? "Unknown"}</Mention>
        </PersonName>
        <RelativeTime iso={comment.createdAt} className="text-2xs text-muted-foreground" />
        {edited && <span className="text-2xs text-muted-foreground">(edited)</span>}
        {comment.pin && (
          <span className="flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-2xs font-medium text-accent-soft-foreground" data-testid="comment-pinned-badge">
            <Pin className="size-3" /> {comment.pin.overview && showOverviewPins ? "Pinned to overview" : "Pinned"}
          </span>
        )}
        {comment.sharedId && (
          <SimpleTooltip label="Posted on the linked task as well — editing changes both">
            <span className="flex items-center gap-1 rounded-full bg-surface-strong px-1.5 py-0.5 text-2xs font-medium text-muted-foreground" data-testid="comment-linked-badge">
              <Link2 className="size-3" /> Linked
            </span>
          </SimpleTooltip>
        )}
      </div>
      <span className="flex shrink-0 items-center opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-confirming]]:opacity-100 has-[[data-state=open]]:opacity-100 pointer-coarse:opacity-100">
        {hoverAction}
        <PinMenu comment={comment} />
        {canEditComment(ws.permissions, comment) && (
          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${noun}`} onClick={onEdit}>
            <Pencil />
          </Button>
        )}
        {mayDelete(comment) && (
          <ConfirmDelete label={`Delete ${noun}`} onConfirm={onDelete} />
        )}
      </span>
      {leading}
    </div>
  );
}

/** Pin, Pin to overview, and the way back from each, on an update or a reply, for whoever can work on the task. */
function PinMenu({ comment }: { comment: Comment }) {
  const onPin = React.useContext(PinControl);
  const overviewPins = React.useContext(OverviewPins);
  if (!onPin) return null;
  const state = pinStateOf(comment);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={comment.parentId ? "Pin reply" : "Pin update"} data-testid="comment-pin-menu">
          <Pin />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {state === "none" ? (
          <DropdownMenuItem onSelect={() => onPin(comment, "pinned")} data-testid="comment-pin">
            <Pin /> Pin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onPin(comment, "none")} data-testid="comment-unpin">
            <PinOff /> Unpin
          </DropdownMenuItem>
        )}
        {!overviewPins ? null : state === "overview" ? (
          <DropdownMenuItem onSelect={() => onPin(comment, "pinned")} data-testid="comment-unpin-overview">
            <PinOff /> Remove from overview
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onPin(comment, "overview")} data-testid="comment-pin-overview">
            <Pin /> Pin to overview
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** How tall a pinned update stands on the overview before "Show more". */
const PINNED_CLAMP_PX = 132;

/**
 * The update or reply pinned to the task's overview, above the description:
 * that one on its own, without replies or reactions, and clamped when long.
 */
export function PinnedUpdate({ itemId, canEdit, onOpenUpdates }: { itemId: string; canEdit: boolean; onOpenUpdates?: () => void }) {
  const ws = useWorkspace();
  const links = useMentionLinks();
  const comments = useComments(itemId);
  const { pin, check } = useCommentMutations(itemId);
  const pinned = overviewPinOf(comments.data ?? []);
  const onCheck = React.useCallback<CheckHandler>((comment, key, on) => check.mutate({ comment, key, on }), [check]);
  const checklist = useChecklist(pinned, canEdit ? onCheck : undefined);
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > PINNED_CLAMP_PX + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinned?.body]);
  if (!pinned) return null;
  const author = ws.userById(pinned.authorId);
  const clamped = overflows && !expanded;
  return (
    <section className="rounded-xl border border-border/70 bg-surface/60 p-3" data-testid="panel-pinned-update">
      <div className="flex items-center gap-2">
        <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <UserAvatar user={author} size="xs" />
        <span className="min-w-0 truncate text-[13px] font-medium">
          <Mention href={links.person(pinned.authorId)}>{author?.displayName ?? "Unknown"}</Mention>
        </span>
        <RelativeTime iso={pinned.createdAt} className="shrink-0 text-2xs text-muted-foreground" />
        <span className="flex-1" />
        <ChecklistTally comment={pinned} />
        {onOpenUpdates && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-2xs text-muted-foreground" onClick={onOpenUpdates} data-testid="panel-pinned-open">
            View in updates
          </Button>
        )}
        {canEdit && (
          <SimpleTooltip label="Remove from overview">
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove from overview" onClick={() => pin.mutate({ comment: pinned, state: "pinned" })} data-testid="panel-pinned-remove">
              <X />
            </Button>
          </SimpleTooltip>
        )}
      </div>
      <div className="relative mt-1.5">
        <div ref={bodyRef} className={cn("overflow-hidden pl-[22px] text-[13px]", clamped && "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]")} style={clamped ? { maxHeight: PINNED_CLAMP_PX } : undefined}>
          <RichText body={pinned.body} mentionNames={names} className="leading-relaxed" mentionHref={links.personNamed} checklist={checklist} />
        </div>
        {overflows && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 ml-[22px] text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid="panel-pinned-more">
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * What a checklist in an update shows and does: who ticked each box, and a
 * toggle for the update's author alone, where they may work on the task. The
 * same on the update and on its pinned copy on the overview.
 */
function useChecklist(comment: Comment | null, toggle: CheckHandler | undefined) {
  const ws = useWorkspace();
  return React.useMemo(() => {
    if (!comment) return undefined;
    const who = (id: string | null) => (id === ws.currentUser.id ? "you" : ((id && ws.userById(id)?.displayName) ?? "someone"));
    const mine = comment.authorId === ws.currentUser.id;
    return {
      ticked: new Map((comment.checks ?? []).map((c) => [c.key, `Ticked by ${who(c.userId)}, ${formatRelative(c.checkedAt)}`])),
      onToggle: toggle && mine ? (key: string, on: boolean) => toggle(comment, key, on) : undefined,
    };
  }, [comment, toggle, ws]);
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
function CommentAuthorName({ comment, size = "xs" }: { comment: Comment; size?: "xs" | "sm" }) {
  const ws = useWorkspace();
  const author = ws.userById(comment.authorId);
  return (
    <span className={cn("flex min-w-0 shrink-0 items-center text-[13px] font-medium", size === "sm" ? "gap-2" : "gap-1.5")}>
      <UserAvatar user={author} size={size} />
      <PersonName user={author}>{author?.displayName ?? "Unknown"}</PersonName>
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
  const toggle = React.useContext(CheckToggle);
  const [draft, setDraft] = React.useState(comment.body);
  const save = () => {
    if (draft.trim()) onSave(draft.trim());
    onEditingChange(false);
  };
  const checklist = useChecklist(comment, toggle);
  if (!editing) return <RichText body={comment.body} mentionNames={names} className={cn("leading-relaxed", className)} mentionHref={links.personNamed} checklist={checklist} />;
  return (
    <form
      className={cn("space-y-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <RichTextEditor value={draft} onChange={setDraft} onSubmit={save} people={ws.activeUsers} ariaLabel="Edit update" testId="comment-edit-input" autoFocus checklist />
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
      className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
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
        <RichTextEditor compact={!full} value={draft} onChange={setDraft} onSubmit={send} people={ws.activeUsers} placeholder="Write a reply… type @ to mention" ariaLabel="Reply" testId="comment-reply-input" autoFocus checklist />
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
