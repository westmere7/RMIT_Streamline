"use client";

import { useMutation } from "@tanstack/react-query";
import { Bug, ImagePlus, LoaderCircle, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BUG_CATEGORIES, MAX_BUG_DESCRIPTION, MAX_BUG_SCREENSHOTS, type BugCategoryId } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { cn } from "@/lib/utils";
import { CURRENT_VERSION } from "@/lib/version";
import { ScreenshotError, toScreenshot } from "./screenshot";

/**
 * "Report a bug", opened from About and from everybody's own menu: one dialog,
 * mounted once in the app shell. The page it was opened on travels with the
 * report, so it is remembered at the moment of opening.
 */
export const useBugReportDialog = create<{ open: boolean; pageUrl: string | null; show: () => void; hide: () => void }>((set) => ({
  open: false,
  pageUrl: null,
  show: () => set({ open: true, pageUrl: typeof window === "undefined" ? null : window.location.href }),
  hide: () => set({ open: false }),
}));

/** Mounted once, in the app shell. */
export function BugReportHost() {
  const { open, pageUrl, hide } = useBugReportDialog();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent data-testid="bug-report-dialog">{open && <BugReportForm pageUrl={pageUrl} onDone={hide} />}</DialogContent>
    </Dialog>
  );
}

interface Shot {
  id: string;
  dataUrl: string;
}

function BugReportForm({ pageUrl, onDone }: { pageUrl: string | null; onDone: () => void }) {
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const [category, setCategory] = React.useState<BugCategoryId>("broken");
  const [description, setDescription] = React.useState("");
  const [shots, setShots] = React.useState<Shot[]>([]);
  const [reading, setReading] = React.useState(0);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const room = MAX_BUG_SCREENSHOTS - shots.length - reading;

  const addFiles = async (files: readonly Blob[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const taken = images.slice(0, Math.max(0, room));
    if (taken.length < images.length) toast.error(`Up to ${MAX_BUG_SCREENSHOTS} screenshots.`);
    setReading((n) => n + taken.length);
    for (const file of taken) {
      try {
        const { dataUrl } = await toScreenshot(file);
        setShots((now) => (now.length < MAX_BUG_SCREENSHOTS ? [...now, { id: crypto.randomUUID(), dataUrl }] : now));
      } catch (error) {
        toast.error(error instanceof ScreenshotError ? error.message : "That image could not be added.");
      } finally {
        setReading((n) => n - 1);
      }
    }
  };

  // A screenshot pasted anywhere in the dialog, the description included.
  const onPaste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  };

  const send = useMutation({
    mutationFn: () =>
      services.bugReports.submit({
        workspaceId: ws.workspace.id,
        workspaceSlug: ws.slug,
        reporterId: user.id,
        report: {
          category,
          description,
          screenshots: shots.map((s) => s.dataUrl),
          pageUrl,
          appVersion: CURRENT_VERSION.version,
          userAgent: navigator.userAgent.slice(0, 400),
          viewport: `${window.innerWidth} × ${window.innerHeight}`,
        },
      }),
    onSuccess: async (receipt) => {
      publishDataChange({ kinds: ["workspace", "board", "items"] });
      toast.success(receipt.ticket ? `Bug reported as ${receipt.ticket}. Thank you.` : "Bug reported. Thank you.");
      onDone();
      await ws.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send the report"),
  });

  const ready = description.trim().length > 0 && reading === 0 && !send.isPending;

  return (
    <div
      onPaste={onPaste}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bug className="size-5 text-muted-foreground" /> Report a bug
        </DialogTitle>
        <DialogDescription>It goes straight to whoever looks after Streamline.</DialogDescription>
      </DialogHeader>
      <form
        id="bug-report-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) send.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as BugCategoryId)}>
            <SelectTrigger aria-label="Category" data-testid="bug-report-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUG_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id} data-testid={`bug-report-category-${c.id}`}>
                  <span aria-hidden className={cn("size-2 rounded-full", colorClasses(c.color).dot)} />
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bug-report-description">What happened?</Label>
          <Textarea
            id="bug-report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_BUG_DESCRIPTION}
            rows={5}
            autoFocus
            placeholder="What you did, what you expected, and what happened instead"
            data-testid="bug-report-description"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Screenshots</Label>
          <div className="flex flex-wrap gap-2" data-testid="bug-report-screenshots">
            {shots.map((shot, index) => (
              <div key={shot.id} className="group relative size-20 overflow-hidden rounded-lg border border-border/70 bg-muted" data-testid="bug-report-screenshot">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL the browser just made */}
                <img src={shot.dataUrl} alt={`Screenshot ${index + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setShots((now) => now.filter((s) => s.id !== shot.id))}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-xs"
                  aria-label={`Remove screenshot ${index + 1}`}
                  data-testid="bug-report-screenshot-remove"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {Array.from({ length: reading }, (_, index) => (
              <div key={`reading-${index}`} className="flex size-20 items-center justify-center rounded-lg border border-border/70 bg-muted">
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              </div>
            ))}
            {room > 0 && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-20 min-w-20 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                data-testid="bug-report-add-screenshot"
              >
                <ImagePlus className="size-4 shrink-0" /> Upload, drop or paste
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
            data-testid="bug-report-file"
          />
        </div>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="bug-report-form" disabled={!ready} data-testid="bug-report-send">
          {send.isPending ? <LoaderCircle className="animate-spin" /> : null} {send.isPending ? "Sending…" : "Send report"}
        </Button>
      </DialogFooter>
    </div>
  );
}
