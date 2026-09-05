"use client";

import { MessageSquare, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useMessageMutations, useMessageRealtime, useMessageThread, useMessageThreads } from "@/features/messages/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Direct messages: the people you have talked to on the left, the open thread on
 * the right. `?to=<userId>` opens (or starts) a thread, which is what the Message
 * button on a profile links to.
 */
export function MessagesPage() {
  const ws = useWorkspace();
  const me = useCurrentUser();
  const params = useSearchParams();
  const openWith = params.get("to");
  const [query, setQuery] = React.useState("");

  useMessageRealtime();
  const threads = useMessageThreads();
  const thread = useMessageThread(openWith);
  const { send, markRead, remove } = useMessageMutations(openWith);
  const [draft, setDraft] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);

  const other = openWith ? ws.userById(openWith) : null;
  const unreadInOpenThread = (thread.data ?? []).some((m) => m.recipientId === me.id && m.readAt === null);

  // Opening a thread clears its unread badge.
  React.useEffect(() => {
    if (openWith && unreadInOpenThread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the thread or its unread state changes
  }, [openWith, unreadInOpenThread]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.length, openWith]);

  const people = ws.users
    .filter((u) => u.id !== me.id && u.deactivatedAt === null)
    .filter((u) => {
      const q = query.trim().toLowerCase();
      return !q || u.displayName.toLowerCase().includes(q) || (u.jobTitle ?? "").toLowerCase().includes(q);
    });
  const threadsByUser = new Map((threads.data ?? []).map((t) => [t.userId, t]));
  // People you have talked to first, then everyone else so a new thread is one click away.
  const rows = [...people].sort((a, b) => {
    const aAt = threadsByUser.get(a.id)?.lastMessage.createdAt ?? "";
    const bAt = threadsByUser.get(b.id)?.lastMessage.createdAt ?? "";
    if (aAt && bAt) return bAt.localeCompare(aAt);
    if (aAt) return -1;
    if (bAt) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || !openWith) return;
    send.mutate(body);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <PageHeader title="Messages" description="Direct messages with people in this workspace." />
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-6 pt-4">
        <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-border/70 bg-card shadow-xs">
          <div className="border-b border-border/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className="h-8 pl-8 text-[13px]" aria-label="Search people" />
            </div>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
            {threads.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-1 h-12" />)}
            {rows.map((user) => {
              const summary = threadsByUser.get(user.id);
              const active = openWith === user.id;
              return (
                <li key={user.id}>
                  <Link
                    href={routes.messages(ws.slug, user.id)}
                    data-testid="message-person"
                    data-person={user.displayName}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                      active ? "bg-accent text-foreground" : "hover:bg-accent/60",
                    )}
                  >
                    <UserAvatar user={user} size="md" tooltip={false} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                      <span className="block truncate text-2xs text-muted-foreground">{summary ? summary.lastMessage.body : (user.jobTitle ?? "")}</span>
                    </span>
                    {!!summary?.unread && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground">{summary.unread}</span>
                    )}
                  </Link>
                </li>
              );
            })}
            {rows.length === 0 && <li className="px-2 py-6 text-center text-2xs text-muted-foreground">Nobody matches that search.</li>}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-border/70 bg-card shadow-xs">
          {!openWith || !other ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessageSquare} title="No conversation open" description="Pick someone on the left to start or continue a conversation." compact />
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                <UserAvatar user={other} size="md" tooltip={false} />
                <div className="min-w-0 leading-tight">
                  <Link href={routes.person(ws.slug, other.id)} className="block truncate text-[13px] font-medium hover:underline">
                    {other.displayName}
                  </Link>
                  <span className="block truncate text-2xs text-muted-foreground">{other.jobTitle ?? other.email}</span>
                </div>
              </header>

              <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4" data-testid="message-thread">
                {thread.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                {thread.data?.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">No messages yet — say hello.</p>
                )}
                {thread.data?.map((message) => {
                  const mine = message.senderId === me.id;
                  return (
                    <div key={message.id} className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                      <div
                        data-testid="message-bubble"
                        className={cn(
                          "max-w-[min(30rem,75%)] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-surface",
                        )}
                      >
                        {message.body}
                        <RelativeTime iso={message.createdAt} className={cn("mt-1 block text-2xs", mine ? "text-primary-foreground/70" : "text-muted-foreground")} />
                      </div>
                      {mine && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Delete message"
                          className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          onClick={() => remove.mutate(message.id)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form
                className="border-t border-border/60 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder={`Message ${other.displayName}…`}
                    rows={2}
                    className="min-h-[2.5rem] resize-none text-[13px]"
                    data-testid="message-input"
                  />
                  <Button type="submit" size="sm" disabled={!draft.trim() || send.isPending} data-testid="message-send">
                    <Send /> Send
                  </Button>
                </div>
                <p className="mt-1 text-2xs text-muted-foreground">Ctrl/⌘ + Enter to send</p>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
