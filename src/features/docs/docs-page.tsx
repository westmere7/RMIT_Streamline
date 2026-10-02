"use client";

import { FileText, FileUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { type MenuAction, RowMenu } from "@/components/layout/row-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocSummary } from "@/domain";
import { CreateDocDialog } from "@/features/docs/create-doc-dialog";
import { useDocMutations, useDocs } from "@/features/docs/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canEditDocs } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Every team's docs, newest change first. */
export function DocsPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const docs = useDocs();
  const { remove } = useDocMutations();
  const canEdit = canEditDocs(ws.permissions);
  const [creating, setCreating] = React.useState<"blank" | "upload" | null>(null);
  const [deleting, setDeleting] = React.useState<DocSummary | null>(null);
  const list = React.useMemo(() => [...(docs.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [docs.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader
          title="Docs"
          description="Briefs, processes, guides and notes, kept beside the work."
          actions={
            canEdit && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setCreating("upload")} data-testid="upload-doc">
                  <FileUp /> Upload
                </Button>
                <Button onClick={() => setCreating("blank")} data-testid="new-doc">
                  <Plus /> New doc
                </Button>
              </div>
            )
          }
        />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto w-full max-w-6xl">
          {docs.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={FileText} title="No docs yet" description="Write one, or upload a Word, Markdown, text or PDF file." action={canEdit && <Button onClick={() => setCreating("blank")}>New doc</Button>} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((doc) => {
                const team = ws.teamById(doc.teamId);
                const actions: MenuAction[] = [
                  { type: "item", label: "Open", icon: <FileText />, onSelect: () => router.push(routes.doc(ws.slug, doc.id)) },
                  ...(canEdit ? ([{ type: "separator" }, { type: "item", label: "Delete doc", icon: <Trash2 />, destructive: true, onSelect: () => setDeleting(doc) }] as MenuAction[]) : []),
                ];
                return (
                  <li key={doc.id}>
                    <RowMenu label={`Options for ${doc.title}`} actions={actions} hideButton>
                      <Link href={routes.doc(ws.slug, doc.id)} className="flex min-h-28 flex-col rounded-xl border border-border/70 bg-card p-4 shadow-xs transition-[background-color,border-color,box-shadow] hover:border-ring/60 hover:shadow-md" data-testid="doc-card">
                        <span className="flex items-center gap-2.5">
                          <DocGlyph doc={doc} className="size-9 text-lg" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold">{doc.title}</span>
                            <span className="flex items-center gap-1 truncate text-2xs text-muted-foreground">
                              {team ? (
                                <>
                                  <DynamicIcon name={team.icon} className={cn("size-3", colorClasses(team.color).text)} /> {team.name}
                                </>
                              ) : (
                                "No team"
                              )}
                            </span>
                          </span>
                          {doc.kind === "pdf" && (
                            <Badge variant="muted" className="ml-auto shrink-0">
                              PDF
                            </Badge>
                          )}
                        </span>
                        <span className="mt-auto pt-3 text-2xs text-muted-foreground">
                          Edited <RelativeTime iso={doc.updatedAt} />
                        </span>
                      </Link>
                    </RowMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <CreateDocDialog key={creating ?? "closed"} open={creating !== null} onOpenChange={(open) => !open && setCreating(null)} upload={creating === "upload"} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description="This deletes the doc for everyone. It cannot be brought back."
        confirmLabel="Delete doc"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      />
    </div>
  );
}

/** A doc's mark: its own emoji, or the page or PDF icon. */
export function DocGlyph({ doc, className }: { doc: Pick<DocSummary, "icon" | "kind">; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-surface-strong leading-none", className)} aria-hidden>
      {doc.icon ?? <FileText className={cn("size-4", doc.kind === "pdf" ? "text-red-500" : "text-muted-foreground")} />}
    </span>
  );
}
