"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Lock, Package, X } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useServices } from "@/features/data/data-context";
import type { PortalCredentials } from "@/features/portal/portal-client";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * One request, opened over the list.
 *
 * A full-screen surface on a phone and a panel on a desktop, which is the same
 * shape the application's own item panel takes — a stakeholder reading on a
 * phone should not be handed a narrow column of a wide layout.
 *
 * The two write controls only appear when the server has said this visitor may
 * use them (`canAct`, computed from a real session and a seat on the task's own
 * board). Hiding them is courtesy; the route re-checks everything regardless,
 * so a visitor who forges the request still gets a 403.
 */
export function PortalTaskDetailPanel({ credentials, itemId, onClose }: { credentials: PortalCredentials; itemId: string; onClose: () => void }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const queryKey = ["portal-task", credentials.token, credentials.credentialVersion, itemId] as const;
  const task = useQuery({
    queryKey,
    queryFn: () => services.portals.publicTask(credentials, itemId),
    retry: false,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === "Escape" && !inField) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detail = task.data;
  const late = detail && detail.status?.role !== "done" && isOverdue(detail.dueDate);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={detail?.name ?? "Request"} data-testid="portal-task-detail">
      {/* The backdrop closes it; the panel swallows the click so the inside does not. */}
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-border/70 bg-surface shadow-2xl">
        <div className="flex shrink-0 items-start gap-2 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            {detail?.reference && <p className="font-mono text-2xs text-muted-foreground tabular">{detail.reference}</p>}
            <h2 className="text-[17px] leading-snug font-semibold tracking-tight">{detail?.name ?? "Request"}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="size-11 shrink-0">
            <X />
          </Button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {task.isLoading && <Skeleton className="h-48 w-full" />}
          {task.isError && <ErrorState title="Could not open this request." error={task.error} onRetry={() => task.refetch()} />}

          {detail && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-2xs">
                {detail.status && <span className={cn("rounded-full px-2 py-0.5 font-medium", colorClasses(detail.status.color).soft)}>{detail.status.name}</span>}
                {detail.priority && <span className="text-muted-foreground">{detail.priority.name} priority</span>}
                {detail.dueDate && <span className={cn(late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>Due {formatShortDate(detail.dueDate)}</span>}
                {detail.sourceName && <span className="text-muted-foreground">{detail.sourceName}</span>}
              </div>

              {detail.brief && (
                <section>
                  <h3 className="mb-1.5 label-quiet">Brief</h3>
                  <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{detail.brief}</p>
                </section>
              )}

              {detail.people.length > 0 && (
                <section>
                  <h3 className="mb-1.5 label-quiet">Who is on it</h3>
                  <p className="text-[13px]">{detail.people.map((p) => p.displayName).join(", ")}</p>
                </section>
              )}

              {detail.fullDeliverables.length > 0 && (
                <section>
                  <h3 className="mb-1.5 flex items-center gap-1.5 label-quiet">
                    <Package className="size-3.5" aria-hidden /> Deliverables
                  </h3>
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                    {detail.fullDeliverables.map((asset) => (
                      <li key={asset.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                        {detail.canAct ? (
                          <AssetTick credentials={credentials} itemId={itemId} assetId={asset.id} done={asset.done} onDone={() => queryClient.invalidateQueries({ queryKey })} />
                        ) : (
                          <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full border", asset.done ? "border-green-600 bg-green-600" : "border-border")} />
                        )}
                        <span className={cn("min-w-0 flex-1 truncate", asset.done && "text-muted-foreground line-through")}>{asset.name}</span>
                        {asset.assetType && <span className="shrink-0 text-2xs text-muted-foreground">{asset.assetType}</span>}
                        {asset.dueDate && <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatShortDate(asset.dueDate)}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.fullSubitems.length > 0 && (
                <section>
                  <h3 className="mb-1.5 label-quiet">Steps</h3>
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                    {detail.fullSubitems.map((sub) => (
                      <li key={sub.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                        <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full border", sub.done ? "border-green-600 bg-green-600" : "border-border")} />
                        <span className={cn("min-w-0 flex-1 truncate", sub.done && "text-muted-foreground line-through")}>{sub.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.linked.length > 0 && (
                <section>
                  <h3 className="mb-1.5 flex items-center gap-1.5 label-quiet">
                    <Link2 className="size-3.5" aria-hidden /> Related work
                  </h3>
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                    {detail.linked.map((linked, index) => (
                      <li key={linked.id ?? `restricted-${index}`} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                        {linked.restricted ? (
                          <>
                            <Lock className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                            {/* Named only as "work exists". Saying what it is called
                                would publish a task nobody agreed to publish. */}
                            <span className="text-muted-foreground">Related work on another team&rsquo;s board</span>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate">{linked.name}</span>
                            {linked.status && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium", colorClasses(linked.status.color).soft)}>{linked.status.name}</span>}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.canAct && <StaffComment credentials={credentials} itemId={itemId} />}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Ticking a deliverable off. Only rendered for staff; the route checks anyway. */
function AssetTick({ credentials, itemId, assetId, done, onDone }: { credentials: PortalCredentials; itemId: string; assetId: string; done: boolean; onDone: () => void }) {
  const services = useServices();
  const toggle = useMutation({
    mutationFn: (next: boolean) => services.portals.publicSetDeliverableDone(credentials, itemId, assetId, next, services.assets),
    onSuccess: onDone,
  });
  return <Checkbox checked={done} disabled={toggle.isPending} onCheckedChange={(next) => toggle.mutate(next === true)} aria-label="Mark this deliverable done" />;
}

/**
 * An update, posted by a member of staff without leaving the portal.
 *
 * Deliberately one-way: internal threads carry discussion across boards, and
 * none of it belongs in an anonymous response. This posts a new update through
 * the ordinary service — same attribution, same mentions, same notifications —
 * and shows nothing back.
 */
function StaffComment({ credentials, itemId }: { credentials: PortalCredentials; itemId: string }) {
  const services = useServices();
  const [body, setBody] = React.useState("");
  const post = useMutation({
    mutationFn: () => services.portals.publicComment(credentials, itemId, body.trim(), services.comments),
    onSuccess: () => setBody(""),
  });

  return (
    <section className="rounded-xl border border-border/70 bg-card p-3">
      <h3 className="mb-1.5 label-quiet">Post an update</h3>
      <p className="mb-2 text-2xs text-muted-foreground">Goes to the task inside Streamline, attributed to you. The stakeholder does not see internal discussion here.</p>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What has moved?" aria-label="Update" data-testid="portal-comment" />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()} data-testid="portal-comment-post">
          {post.isPending ? "Posting…" : "Post update"}
        </Button>
        {post.isSuccess && <span className="text-2xs text-muted-foreground">Posted.</span>}
        {post.isError && (
          <span role="alert" className="text-2xs text-destructive">
            {post.error instanceof Error ? post.error.message : "Could not post that."}
          </span>
        )}
      </div>
    </section>
  );
}
