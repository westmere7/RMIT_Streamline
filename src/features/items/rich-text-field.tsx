"use client";

import { ChevronRight, Copy, Maximize2, Pencil, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { RichText } from "@/components/shared/rich-text";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { richTextToPlain } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/**
 * A formatted document, wherever one turns up: the board's Brief column, and
 * the field of the same name on the task panel.
 *
 * A brief is the one thing on a task written to be read start to finish. It
 * used to arrive as three copies of itself — the item's description, a
 * long-text column, and a row of small columns holding one answer each — none
 * of which could show a heading or make a link clickable, and all of which had
 * to be kept in step by hand. It is one document now, in one place, formatted:
 * headings for the questions, lists for the choices, and links somebody can
 * follow.
 *
 * It is long by nature, so nothing here shows all of it uninvited. The panel
 * field opens closed; the popup is where it is read in full.
 */

/** The document, rendered. Mentions resolve against the workspace. */
export function RichTextDocument({ body, className }: { body: string; className?: string }) {
  const ws = useWorkspace();
  const names = React.useMemo(() => ws.users.map((u) => u.displayName), [ws.users]);
  if (!body.trim()) return <p className="text-[13px] text-muted-foreground">Nothing here yet.</p>;
  return <RichText body={body} mentionNames={names} className={cn("leading-relaxed", className)} />;
}

/** The first words of a document, for a cell and for a closed field. */
export function richTextSummary(body: string): string {
  return richTextToPlain(body).replace(/\s+/g, " ").trim();
}

/**
 * Puts the document on the clipboard as the markup it is stored in.
 *
 * Not the flattened text: the markup is ordinary Markdown, so a brief pasted
 * into a mail, a chat or a document arrives with its headings and its lists
 * still on it. Flattening it here would be a decision taken on behalf of every
 * place it might be pasted.
 */
export async function copyRichText(body: string, what = "Brief"): Promise<void> {
  try {
    await navigator.clipboard.writeText(body);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy to the clipboard");
  }
}

interface DocProps {
  title: string;
  body: string;
  canEdit: boolean;
  onSave: (body: string) => void;
}

/**
 * The document with its own title bar: read it, copy it, or edit it in place.
 *
 * Shared by the popup a board cell opens and the one the panel opens, so a
 * brief is the same thing to look at whichever one you arrived through.
 */
export function RichTextDocBody({ title, body, canEdit, onSave, onDone, onClose, testId }: DocProps & { onDone?: () => void; onClose?: () => void; testId?: string }) {
  const ws = useWorkspace();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(body);
  const start = () => {
    setDraft(body);
    setEditing(true);
  };
  return (
    <div className="flex max-h-[min(38rem,72vh)] flex-col" data-testid={testId}>
      {/* Closing is one of the buttons in this row rather than the dialog's own
          corner cross. The cross is positioned against the dialog, this row
          against itself, and the two land six pixels apart — near enough to
          read as a mistake and never near enough to fix by nudging either. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</p>
        {!editing && (
          <>
            <DocButton label={`Copy ${title.toLowerCase()}`} onClick={() => void copyRichText(body, title)} testId="rich-text-copy">
              <Copy className="size-3.5" />
            </DocButton>
            {canEdit && (
              <DocButton label="Edit" onClick={start} testId="rich-text-edit">
                <Pencil className="size-3.5" />
              </DocButton>
            )}
          </>
        )}
        {onClose && (
          <DocButton label="Close" onClick={onClose} testId="rich-text-close">
            <X className="size-4" />
          </DocButton>
        )}
      </div>
      {editing ? (
        <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <RichTextEditor value={draft} onChange={setDraft} people={ws.activeUsers} rows={12} autoFocus ariaLabel={title} testId="rich-text-input" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (draft !== body) onSave(draft);
                setEditing(false);
                onDone?.();
              }}
              className="h-7 rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
              data-testid="rich-text-save"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3.5 py-3" data-testid="rich-text-view">
          <RichTextDocument body={body} />
        </div>
      )}
    </div>
  );
}

/** The document as a window of its own, opened from a cell or from the panel. */
export function RichTextDocDialog({ open, onOpenChange, ...doc }: DocProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `hideClose`: the cross belongs in the title bar with the other two. */}
      <DialogContent size="lg" className="p-0" hideClose data-testid="rich-text-dialog">
        <DialogHeader className="sr-only">
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>The document in full, with its formatting and its links.</DialogDescription>
        </DialogHeader>
        <RichTextDocBody {...doc} onClose={() => onOpenChange(false)} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The document as a field of the task panel: closed, until somebody wants it.
 *
 * Closed because everything under it — the deliverables, the linked tasks, the
 * subitems — is what somebody scrolling the panel is usually after, and a brief
 * opened by default pushes all of it below the fold. The row still says what is
 * in there: the first line of it, and the controls to open it where it stands,
 * copy it, or give it a window of its own.
 */
export function RichTextPanelField({ title, body, canEdit, onSave }: DocProps) {
  const [open, setOpen] = React.useState(false);
  const [popup, setPopup] = React.useState(false);
  const summary = richTextSummary(body);
  return (
    <section className="mt-3" data-testid="rich-text-field">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="flex items-center gap-1 pr-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-2 text-left"
            data-testid="rich-text-field-toggle"
          >
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
            <span className="shrink-0 text-[13px] font-medium">{title}</span>
            {!open && <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{summary || "Empty"}</span>}
          </button>
          <DocButton label={`Copy ${title.toLowerCase()}`} onClick={() => void copyRichText(body, title)} testId="rich-text-field-copy">
            <Copy className="size-3.5" />
          </DocButton>
          <DocButton label={`Open ${title.toLowerCase()}`} onClick={() => setPopup(true)} testId="rich-text-field-popup">
            <Maximize2 className="size-3.5" />
          </DocButton>
        </div>
        {open && (
          <div className="border-t border-border/60">
            <div className="scrollbar-thin max-h-96 overflow-y-auto px-3 py-2.5" data-testid="rich-text-field-body">
              <RichTextDocument body={body} />
            </div>
            {canEdit && (
              <div className="flex justify-end border-t border-border/60 px-2 py-1.5">
                <DocButton label="Edit" onClick={() => setPopup(true)} testId="rich-text-field-edit">
                  <Pencil className="size-3.5" />
                </DocButton>
              </div>
            )}
          </div>
        )}
      </div>
      <RichTextDocDialog open={popup} onOpenChange={setPopup} title={title} body={body} canEdit={canEdit} onSave={onSave} />
    </section>
  );
}

function DocButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        data-testid={testId}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}
