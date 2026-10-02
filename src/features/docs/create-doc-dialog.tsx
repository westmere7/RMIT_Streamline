"use client";

import { FileText, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataContext } from "@/features/data/data-context";
import { htmlToDocContent } from "@/features/docs/doc-editor";
import { storeDocFile } from "@/features/docs/doc-files";
import { DOC_IMPORT_ACCEPT, readDocFile, titleFromFileName } from "@/features/docs/doc-import";
import { useDocMutations } from "@/features/docs/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId } from "@/lib/ids";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface CreateDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The team it goes in; preselected when opened from a team. */
  defaultTeamId?: string | null;
  /** Open straight on choosing a file. */
  upload?: boolean;
}

/** A new doc in a team: a blank page, or a file someone already has. */
export function CreateDocDialog({ open, onOpenChange, defaultTeamId, upload }: CreateDocDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CreateDocForm defaultTeamId={defaultTeamId} upload={upload} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateDocForm({ defaultTeamId, upload, onClose }: { defaultTeamId?: string | null; upload?: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const { providerKind } = useDataContext();
  const { create } = useDocMutations();
  // Ordinary teams first: the built-in Admin team is somewhere a doc goes on purpose, not by default.
  const teams = ws.teams.filter((t) => t.archivedAt === null).sort((a, b) => Number(!!a.system) - Number(!!b.system));
  const [title, setTitle] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>(defaultTeamId ?? teams[0]?.id ?? "");
  const [source, setSource] = React.useState<"blank" | "file">(upload ? "file" : "blank");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (upload) fileRef.current?.click();
  }, [upload]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || (source === "file" && !file)) return;
    setBusy(true);
    // A file that cannot be read or stored says why here; a failed save has
    // already said so through the mutation.
    const fileFailed = (error: unknown) => toast.error("Could not use that file", { description: error instanceof Error ? error.message : undefined });
    try {
      let doc;
      if (source === "file" && file) {
        let read: Awaited<ReturnType<typeof readDocFile>>;
        try {
          read = await readDocFile(file);
        } catch (error) {
          return fileFailed(error);
        }
        const name = title.trim() || read.title;
        if (read.kind === "pdf") {
          // The file goes under the doc's id, so the id is chosen first.
          const id = newId();
          let path: string;
          try {
            path = await storeDocFile(providerKind, ws.workspace.id, id, read.file);
          } catch (error) {
            return fileFailed(error);
          }
          doc = await create.mutateAsync({ id, teamId, title: name, kind: "pdf", file: { path, name: read.file.name, size: read.file.size } });
        } else {
          doc = await create.mutateAsync({ teamId, title: name, kind: "page", content: htmlToDocContent(read.html) });
        }
      } else {
        doc = await create.mutateAsync({ teamId, title: title.trim(), kind: "page" });
      }
      onClose();
      router.push(routes.doc(ws.slug, doc.id));
    } catch {
      // The mutation has toasted.
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>New doc</DialogTitle>
        <DialogDescription>Write a page, or bring in a Word, Markdown, text or PDF file.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="doc-title">Title</Label>
          <Input id="doc-title" autoFocus={!upload} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file ? titleFromFileName(file.name) : "Untitled"} data-testid="doc-title-input" />
        </div>
        <div className="space-y-1.5">
          <Label>Team</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger aria-label="Team">
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground/80">Start from</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <SourceOption checked={source === "blank"} onChange={() => setSource("blank")} icon={FileText} title="Blank page" hint="Type / for headings, lists and to-dos." />
          <SourceOption
            checked={source === "file"}
            onChange={() => {
              setSource("file");
              if (!file) fileRef.current?.click();
            }}
            icon={FileUp}
            title="Upload a file"
            hint={file ? file.name : "Word, Markdown and text become a page; a PDF is kept as it is."}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={DOC_IMPORT_ACCEPT}
          hidden
          aria-label="File to bring in"
          data-testid="doc-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) setSource("file");
            e.target.value = "";
          }}
        />
        {source === "file" && (
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> {file ? "Choose a different file" : "Choose a file"}
          </Button>
        )}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !teamId || (source === "file" && !file)} data-testid="create-doc-submit">
          {busy ? "Creating…" : "Create doc"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SourceOption({ checked, onChange, icon: Icon, title, hint }: { checked: boolean; onChange: () => void; icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3.5 text-[13px] transition-colors hover:bg-accent/60", checked && "border-ring/60 state-on")}>
      <input type="radio" name="doc-source" checked={checked} onChange={onChange} className="mt-0.5 accent-primary" />
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-2xs text-muted-foreground" title={hint}>
          {hint}
        </span>
      </span>
    </label>
  );
}
