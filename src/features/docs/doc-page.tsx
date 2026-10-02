"use client";

import type { JSONContent } from "@tiptap/core";
import { ArrowLeft, Check, Download, FileText, FileUp, Loader2, MoreHorizontal, Smile, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Doc } from "@/domain";
import { DOC_TITLE_MAX } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext } from "@/features/data/data-context";
import { DocEditor, type DocEditorHandle } from "@/features/docs/doc-editor";
import { openDocFile } from "@/features/docs/doc-files";
import { readDocFile } from "@/features/docs/doc-import";
import { useDoc, useDocMutations, useDocRealtime, useDocSaver } from "@/features/docs/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditDocs } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Emoji a doc can wear before its title. A short shelf, not a picker for every emoji there is. */
const ICONS = ["📄", "📝", "📋", "📌", "📎", "📚", "📖", "🗂️", "🗓️", "✅", "💡", "🎯", "🚀", "⭐", "🔥", "🎨", "🖼️", "🎬", "📣", "📊", "📈", "🧭", "🧪", "🛠️", "🔒", "🤝", "💬", "🎓", "🏛️", "🌏"];

export function DocPage() {
  const params = useParams<{ docId: string }>();
  const ws = useWorkspace();
  useDocRealtime(params.docId);
  const doc = useDoc(params.docId);

  if (doc.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-12" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }
  if (!doc.data) {
    return (
      <EmptyState
        icon={FileText}
        title="Doc not found"
        description="It may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link href={routes.docs(ws.slug)}>Back to docs</Link>
          </Button>
        }
      />
    );
  }
  // Keyed by the doc, so moving from one doc to another starts the page afresh.
  return <DocView key={doc.data.id} doc={doc.data} />;
}

function DocView({ doc }: { doc: Doc }) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const router = useRouter();
  const mutations = useDocMutations();
  const saver = useDocSaver(doc.id);
  const canEdit = canEditDocs(ws.permissions);
  const editable = canEdit && doc.kind === "page";
  const editorRef = React.useRef<DocEditorHandle>(null);
  const importRef = React.useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const team = ws.teamById(doc.teamId);
  const editor = doc.updatedBy ? ws.userById(doc.updatedBy) : ws.userById(doc.createdBy);

  // The first copy seeds the editor; later ones only replace it when someone
  // else saved and nothing is being typed here.
  const [initial] = React.useState(() => doc.content as JSONContent | null);
  const seen = React.useRef(doc.updatedAt);
  React.useEffect(() => {
    if (doc.updatedAt === seen.current) return;
    seen.current = doc.updatedAt;
    if (doc.updatedBy !== user.id && !saver.dirty.current) editorRef.current?.setContent(doc.content as JSONContent | null);
  }, [doc.updatedAt, doc.updatedBy, doc.content, user.id, saver.dirty]);

  const importInto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const read = await readDocFile(file);
      if (read.kind === "pdf") {
        toast.info("A PDF becomes a doc of its own", { description: "Use New doc → Upload a file to keep it." });
        return;
      }
      const empty = !doc.content || JSON.stringify(doc.content).length < 60;
      if (empty) editorRef.current?.replaceWithHtml(read.html);
      else editorRef.current?.appendHtml(read.html);
      toast.success(empty ? `Brought in ${file.name}` : `Added ${file.name} to the end`);
    } catch (error) {
      toast.error("Could not use that file", { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="doc-page">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <SimpleTooltip label="All docs">
          <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground">
            <Link href={routes.docs(ws.slug)} aria-label="All docs">
              <ArrowLeft />
            </Link>
          </Button>
        </SimpleTooltip>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground" aria-label="Where this doc is">
          {team && (
            <>
              <Link href={routes.team(ws.slug, team.id)} className="shrink-0 hover:text-foreground hover:underline">
                {team.name}
              </Link>
              <span aria-hidden>/</span>
            </>
          )}
          <span className="truncate text-foreground">
            {doc.icon ? `${doc.icon} ` : ""}
            {doc.title}
          </span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SaveState state={editable ? saver.state : "idle"} />
          <span className="hidden text-2xs text-muted-foreground sm:inline">
            {doc.kind === "pdf" ? "View only · updated" : "Edited"} <RelativeTime iso={doc.updatedAt} />
            {editor ? ` by ${editor.firstName || editor.displayName}` : ""}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Doc options" data-testid="doc-menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {editable && (
                <DropdownMenuItem onSelect={() => importRef.current?.click()} data-testid="doc-import">
                  <FileUp /> Bring in a file…
                </DropdownMenuItem>
              )}
              {doc.kind === "pdf" && doc.filePath && <DownloadItem doc={doc} />}
              {canEdit && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Users /> Move to team
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {ws.teams
                      .filter((t) => t.archivedAt === null)
                      .map((t) => (
                        <DropdownMenuItem key={t.id} onSelect={() => t.id !== doc.teamId && mutations.update.mutate({ docId: doc.id, patch: { teamId: t.id } })}>
                          <span className="flex-1 truncate">{t.name}</span>
                          {t.id === doc.teamId && <Check className="size-3.5" />}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)} data-testid="doc-delete">
                    <Trash2 /> Delete doc
                  </DropdownMenuItem>
                </>
              )}
              {!canEdit && <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">Guests read docs; members write them.</DropdownMenuLabel>}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={importRef} type="file" accept=".docx,.md,.markdown,.txt,.html,.htm" hidden aria-label="File to bring in" onChange={(e) => (void importInto(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
      </header>

      <div className={cn("min-h-0 flex-1", doc.kind === "pdf" ? "flex flex-col" : "scrollbar-thin overflow-y-auto")}>
        <div className={cn("mx-auto w-full", doc.kind === "pdf" ? "flex min-h-0 max-w-6xl flex-1 flex-col px-6 pt-6 pb-4" : "max-w-3xl px-6 pt-12 sm:px-12")}>
          <TitleBlock doc={doc} canEdit={canEdit} onEnter={() => document.querySelector<HTMLElement>("[data-testid=doc-editor]")?.focus()} />
          {doc.kind === "pdf" ? <PdfView doc={doc} /> : <DocEditor ref={editorRef} content={initial} editable={editable} onChange={saver.save} className="mt-4" />}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${doc.title}”?`}
        description={doc.kind === "pdf" ? "This deletes the doc and its PDF for everyone." : "This deletes the doc for everyone. It cannot be brought back."}
        confirmLabel="Delete doc"
        destructive
        onConfirm={async () => {
          await mutations.remove.mutateAsync(doc);
          router.push(routes.docs(ws.slug));
        }}
      />
    </div>
  );
}

function SaveState({ state }: { state: "idle" | "pending" | "saving" | "error" }) {
  if (state === "idle") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-2xs", state === "error" ? "text-destructive" : "text-muted-foreground")} data-testid="doc-save-state">
      {state === "error" ? "Not saved" : state === "saving" ? <><Loader2 className="size-3 animate-spin" /> Saving</> : "Unsaved"}
    </span>
  );
}

/** The doc's emoji and title, written like the page's own first line. */
function TitleBlock({ doc, canEdit, onEnter }: { doc: Doc; canEdit: boolean; onEnter: () => void }) {
  const mutations = useDocMutations();
  const [draft, setDraft] = React.useState(doc.title === "Untitled" ? "" : doc.title);
  const [seen, setSeen] = React.useState(doc.title);
  const timer = React.useRef<number | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  // While a rename is waiting to save, a copy arriving from elsewhere does not overwrite it.
  const [typing, setTyping] = React.useState(false);
  if (seen !== doc.title) {
    setSeen(doc.title);
    if (!typing) setDraft(doc.title === "Untitled" ? "" : doc.title);
  }
  // Grows with the title rather than scrolling inside itself.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const save = (title: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setTyping(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setTyping(false);
      if ((title.trim() || "Untitled") !== doc.title) mutations.update.mutate({ docId: doc.id, patch: { title } });
    }, 600);
  };
  return (
    <div className="group/title">
      {(doc.icon || canEdit) && <IconPicker doc={doc} canEdit={canEdit} />}
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        readOnly={!canEdit}
        maxLength={DOC_TITLE_MAX}
        placeholder="Untitled"
        aria-label="Title"
        onChange={(e) => {
          const next = e.target.value.replace(/\n/g, "");
          setDraft(next);
          save(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent text-4xl leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 max-sm:text-3xl"
        data-testid="doc-title"
      />
    </div>
  );
}

function IconPicker({ doc, canEdit }: { doc: Doc; canEdit: boolean }) {
  const mutations = useDocMutations();
  const [open, setOpen] = React.useState(false);
  const set = (icon: string | null) => {
    setOpen(false);
    mutations.update.mutate({ docId: doc.id, patch: { icon } });
  };
  if (!canEdit) return <span className="mb-2 block text-5xl leading-none">{doc.icon}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {doc.icon ? (
          <button type="button" aria-label="Change icon" className="mb-2 block rounded-lg text-5xl leading-none transition-colors hover:bg-accent" data-testid="doc-icon">
            {doc.icon}
          </button>
        ) : (
          <button type="button" className="mb-1 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100" data-testid="doc-add-icon">
            <Smile className="size-3.5" /> Add icon
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {ICONS.map((icon) => (
            <button key={icon} type="button" onClick={() => set(icon)} className={cn("flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent", icon === doc.icon && "bg-accent")} aria-label={`Use ${icon}`}>
              {icon}
            </button>
          ))}
        </div>
        {doc.icon && (
          <button type="button" onClick={() => set(null)} className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Remove icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The kept PDF, shown by the browser's own viewer: readable and printable, never edited. */
function PdfView({ doc }: { doc: Doc }) {
  const { providerKind } = useDataContext();
  const [state, setState] = React.useState<{ url: string } | { error: string } | null>(null);
  React.useEffect(() => {
    if (!doc.filePath) return;
    let revoke: (() => void) | null = null;
    let cancelled = false;
    openDocFile(providerKind, doc.filePath)
      .then((file) => {
        if (cancelled) return file.revoke();
        revoke = file.revoke;
        setState({ url: file.url });
      })
      .catch((error: unknown) => !cancelled && setState({ error: error instanceof Error ? error.message : "Could not open the file." }));
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [providerKind, doc.filePath]);
  return (
    <div className="mt-4 flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-surface/50" data-testid="doc-pdf">
      {!doc.filePath || (state && "error" in state) ? (
        <p className="m-auto text-[13px] text-muted-foreground">{state && "error" in state ? state.error : "This doc has no file."}</p>
      ) : !state ? (
        <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />
      ) : (
        <iframe src={`${state.url}#view=FitH`} title={doc.fileName ?? doc.title} className="min-h-0 w-full flex-1 bg-white" data-testid="doc-pdf-frame" />
      )}
    </div>
  );
}

function DownloadItem({ doc }: { doc: Doc }) {
  const { providerKind } = useDataContext();
  const download = async () => {
    try {
      const file = await openDocFile(providerKind, doc.filePath!);
      const a = document.createElement("a");
      a.href = file.url;
      a.download = doc.fileName ?? `${doc.title}.pdf`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(file.revoke, 5_000);
    } catch (error) {
      toast.error("Could not download the file", { description: error instanceof Error ? error.message : undefined });
    }
  };
  return (
    <DropdownMenuItem onSelect={() => void download()} data-testid="doc-download">
      <Download /> Download PDF
    </DropdownMenuItem>
  );
}
