"use client";

import { ChevronDown, LayoutTemplate, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookingFormTemplate, BookingTemplate } from "@/domain";
import { MAX_BOOKING_TEMPLATE_DESCRIPTION, MAX_BOOKING_TEMPLATE_NAME, templateQuestionCount } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";

export interface TemplatesMenuProps {
  templates: BookingTemplate[];
  /** The form as it stands in the editor: what "Save as template" keeps. */
  current: BookingFormTemplate;
  /** Puts a saved form into the editor. Nothing is live until it is published. */
  onLoad: (template: BookingTemplate) => void;
  onSaveTemplate: (input: { name: string; description: string | null; template: BookingFormTemplate }) => Promise<void>;
  onDeleteTemplate: (template: BookingTemplate) => Promise<void>;
  onReset: () => void;
}

/**
 * Saved forms. A template belongs to the workspace: anyone who can shape the
 * form sees the same list, whoever saved each one. It carries a description
 * because a name alone stops saying anything once there are five of them —
 * "Summer" tells the next person nothing about what is different about it.
 *
 * Loading only fills the editor, so a template can be read over, changed, and
 * published or thrown away without anybody outside having seen it.
 */
export function TemplatesMenu({ templates, current, onLoad, onSaveTemplate, onDeleteTemplate, onReset }: TemplatesMenuProps) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [loadOpen, setLoadOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [typed, setTyped] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<BookingTemplate | null>(null);
  const trimmed = name.trim();
  const replaces = templates.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  // Typing a name that already exists offers what that template says about
  // itself, rather than a blank box under a warning that it is about to be
  // replaced. Worked out as it renders rather than pushed in by an effect, so
  // it follows the name straight away — and anything typed here wins for good.
  const description = typed ?? replaces?.description ?? "";

  const save = async () => {
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSaveTemplate({ name: trimmed, description: description.trim() || null, template: current });
      toast.success(replaces ? `Template “${trimmed}” updated` : `Saved as “${trimmed}”`);
      setSaveOpen(false);
      setName("");
      setTyped(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" data-testid="booking-editor-templates">
            <LayoutTemplate /> Templates <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => setSaveOpen(true)} data-testid="template-save">
            Save this form as a template…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLoadOpen(true)} disabled={templates.length === 0} data-testid="template-load">
            Load a template…
            {templates.length > 0 && <span className="ml-auto text-2xs text-muted-foreground tabular">{templates.length}</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onReset} data-testid="booking-editor-reset">
            <RotateCcw /> Start from the built-in form
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent size="sm" data-testid="template-save-dialog">
          <DialogHeader>
            <DialogTitle>Save as a template</DialogTitle>
            <DialogDescription>Keeps the form as it is in the editor, for anyone who manages this workspace to load again later.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer intake" autoFocus maxLength={MAX_BOOKING_TEMPLATE_NAME} data-testid="template-name" />
              {replaces && <p className="text-2xs text-amber-700 dark:text-amber-300">Replaces the template already called “{replaces.name}”.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="template-description">What it is for</Label>
              <Textarea
                id="template-description"
                value={description}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="e.g. Shorter brief for the December shutdown — no production questions."
                rows={3}
                maxLength={MAX_BOOKING_TEMPLATE_DESCRIPTION}
                data-testid="template-description"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!trimmed || busy} data-testid="template-save-submit">
                {busy ? <LoaderCircle className="animate-spin" /> : null} {replaces ? "Replace template" : "Save template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent size="md" data-testid="template-load-dialog">
          <DialogHeader>
            <DialogTitle>Load a template</DialogTitle>
            <DialogDescription>The template fills the editor. Nothing changes for stakeholders until you publish it.</DialogDescription>
          </DialogHeader>
          <ul className="scrollbar-thin max-h-[60vh] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-3.5 py-2.5" data-testid={`template-row-${t.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{t.name}</p>
                  {t.description && <p className="mt-0.5 text-2xs text-muted-foreground">{t.description}</p>}
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {t.template.services?.length ?? 0} services · {templateQuestionCount(t.template)} questions · saved {formatShortDate(t.updatedAt.slice(0, 10))}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-0.5 shrink-0"
                  onClick={() => {
                    onLoad(t);
                    setLoadOpen(false);
                  }}
                  data-testid={`template-use-${t.id}`}
                >
                  Load
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete template ${t.name}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(t)} data-testid={`template-delete-${t.id}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
            {templates.length === 0 && <li className="px-3.5 py-6 text-center text-[13px] text-muted-foreground">No templates saved yet.</li>}
          </ul>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="The template is removed for everyone. The form in use is not affected."
        confirmLabel="Delete template"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await onDeleteTemplate(deleting);
            toast.success(`Deleted “${deleting.name}”`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete the template");
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
