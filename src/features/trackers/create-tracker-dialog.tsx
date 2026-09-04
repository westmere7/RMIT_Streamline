"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTrackerMutations } from "@/features/trackers/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface CreateTrackerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Team the tracker belongs to; preselected when opened from a team. */
  defaultTeamId?: string | null;
}

type Layout = "campaign" | "blank" | "import";

/** New tracker in a team: start from the campaign asset layout, a blank grid, or an .xlsx file. */
export function CreateTrackerDialog({ open, onOpenChange, defaultTeamId }: CreateTrackerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The content unmounts on close, so the form starts clean every time. */}
      <DialogContent>
        <CreateTrackerForm defaultTeamId={defaultTeamId} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateTrackerForm({ defaultTeamId, onClose }: { defaultTeamId?: string | null; onClose: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const { create } = useTrackerMutations();
  const teams = ws.teams.filter((t) => t.archivedAt === null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>(defaultTeamId ?? teams[0]?.id ?? "");
  const [layout, setLayout] = React.useState<Layout>("campaign");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || (file ? file.name.replace(/\.(xlsx|xlsm|xls)$/i, "") : "");
    if (!trimmed || !teamId) return;
    setBusy(true);
    try {
      let sheets: Awaited<ReturnType<typeof import("@/services/tracker-xlsx").workbookToSheets>>["sheets"] | undefined;
      if (layout === "import" && file) {
        const { workbookToSheets } = await import("@/services/tracker-xlsx");
        const parsed = await workbookToSheets(await file.arrayBuffer());
        if (parsed.sheets.length === 0) throw new Error("No tables were found in that workbook.");
        sheets = parsed.sheets;
      }
      const { tracker } = await create.mutateAsync({ name: trimmed, description: description || null, teamId, layout: layout === "import" ? "blank" : layout, sheets });
      onClose();
      router.push(routes.tracker(ws.slug, tracker.id));
    } catch {
      // The mutation already toasts; a parse failure surfaces the same way.
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>New tracker</DialogTitle>
        <DialogDescription>A spreadsheet that lives in the team — start from the campaign asset layout, a blank grid, or an existing workbook.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="tracker-name">Name</Label>
          <Input
            id="tracker-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.(xlsx|xlsm|xls)$/i, "") : "Domestic Campaigns Asset Tracker"}
            data-testid="tracker-name"
          />
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
      <div className="space-y-1.5">
        <Label htmlFor="tracker-description">Description</Label>
        <Textarea id="tracker-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is tracked here and who keeps it up to date." />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground/80">Start from</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <LayoutOption
            checked={layout === "campaign"}
            onChange={() => setLayout("campaign")}
            title="Campaign assets"
            hint="Channel, stage, status, message, deadlines… with dropdowns and status colours."
          />
          <LayoutOption checked={layout === "blank"} onChange={() => setLayout("blank")} title="Blank grid" hint="Six text columns; add and retype columns as you go." />
          <LayoutOption
            checked={layout === "import"}
            onChange={() => {
              setLayout("import");
              if (!file) fileRef.current?.click();
            }}
            title="Import .xlsx"
            hint={file ? file.name : "One sheet per worksheet; dropdowns and bands are recognised."}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          hidden
          aria-label="Workbook to import"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f) setLayout("import");
            e.target.value = "";
          }}
        />
        {layout === "import" && (
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> {file ? "Choose a different file" : "Choose a workbook"}
          </Button>
        )}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !teamId || (!name.trim() && !file) || (layout === "import" && !file)} data-testid="create-tracker-submit">
          {busy ? "Creating…" : "Create tracker"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LayoutOption({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3.5 text-[13px] transition-colors hover:bg-accent/60", checked && "border-ring/60 state-on")}>
      <input type="radio" name="tracker-layout" checked={checked} onChange={onChange} className="mt-0.5 accent-primary" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-2xs text-muted-foreground" title={hint}>
          {hint}
        </span>
      </span>
    </label>
  );
}
