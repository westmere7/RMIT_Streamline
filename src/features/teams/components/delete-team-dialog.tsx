"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Team } from "@/domain";
import { pluralize } from "@/lib/utils";

export interface DeleteTeamDialogProps {
  team: Team | null;
  /** Boards that belong to the team, and the trackers filed under it. */
  boardCount: number;
  trackerCount: number;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (withBoards: boolean) => void;
}

/**
 * Deleting a team, with the choice that matters: do its boards go too?
 *
 * Left alone, the boards stay in the workspace with no team, which is a tidy-up.
 * Taken with the team, everything on them goes — items, updates, asset lines —
 * and nothing here can bring them back, so that path asks for the team's name
 * to be typed out before the button will work.
 */
export function DeleteTeamDialog({ team, boardCount, trackerCount, busy, onOpenChange, onConfirm }: DeleteTeamDialogProps) {
  // The body is mounted only while the dialog is open, so each time it opens the
  // tick box and the typed name start empty again without anything to reset.
  return (
    <Dialog open={team !== null} onOpenChange={onOpenChange}>
      {team && <DeleteTeamBody team={team} boardCount={boardCount} trackerCount={trackerCount} busy={busy} onOpenChange={onOpenChange} onConfirm={onConfirm} />}
    </Dialog>
  );
}

function DeleteTeamBody({ team, boardCount, trackerCount, busy, onOpenChange, onConfirm }: DeleteTeamDialogProps & { team: Team }) {
  const [withBoards, setWithBoards] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const contents = [boardCount > 0 ? pluralize(boardCount, "board") : null, trackerCount > 0 ? pluralize(trackerCount, "tracker") : null].filter(Boolean).join(" and ");
  const confirmed = typed.trim() === team.name;

  return (
    <DialogContent size="md" data-testid="delete-team-dialog">
      <DialogHeader>
        <DialogTitle>Delete {team.name}?</DialogTitle>
        <DialogDescription>The team, its membership and its settings go. This cannot be undone.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {contents ? (
          <label className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-surface/50 p-3.5 text-[13px]" htmlFor="delete-team-boards">
            <Checkbox id="delete-team-boards" aria-label={`Delete its ${contents} as well`} checked={withBoards} onCheckedChange={(checked) => setWithBoards(checked === true)} className="mt-0.5" data-testid="delete-team-boards" />
            <span>
              <span className="font-medium">Delete its {contents} as well</span>
              <span className="mt-0.5 block text-muted-foreground">
                {withBoards
                  ? "Every item, update, asset line and file on them goes with the team. Nothing here can bring them back."
                  : `Left unticked, the ${contents} stay in the workspace without a team, and you can file them under another one later.`}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-[13px] text-muted-foreground">This team has no boards or trackers of its own.</p>
        )}

        {withBoards && (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3.5 text-[13px] text-destructive" role="alert" data-testid="delete-team-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              You are about to delete {contents} and everything on them. Other boards that link to their items will lose those links. There is no undo and no archive to restore from.
            </span>
          </p>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="delete-team-confirm">
            Type <span className="font-semibold text-foreground">{team.name}</span> to confirm
          </Label>
          <Input
            id="delete-team-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={team.name}
            autoComplete="off"
            aria-invalid={typed.length > 0 && !confirmed}
            data-testid="delete-team-confirm"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={!confirmed || busy} onClick={() => onConfirm(withBoards)} data-testid="delete-team-submit">
          {busy ? <LoaderCircle className="animate-spin" /> : null} {withBoards && contents ? `Delete team and ${contents}` : "Delete team"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
