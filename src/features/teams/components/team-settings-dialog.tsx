"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { LookPicker } from "@/components/shared/look-picker";
import { SettingsDialogFrame } from "@/components/shared/settings-dialog-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Team } from "@/domain";
import { AccessGrid, AccessPickers } from "@/features/boards/components/board-visibility-field";
import { BookingBoardSetting } from "@/features/booking/booking-board-setting";
import { useServices } from "@/features/data/data-context";
import { TeamMembersEditor } from "@/features/teams/components/team-members-editor";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditTeamAccess, canManageTeam, teamAccessFor } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";

export type TeamSettingsSection = "general" | "access" | "members" | "bookings";

/**
 * A team's settings, in the same frame and order as a board's where they
 * share a tab (General, Access, Members), so the two read alike. Each change
 * is saved as it is made, as on a board; the name and description wait for
 * their Save button. A built-in team (Admin) has no Access or Bookings.
 */
export function TeamSettingsDialog({ team: given, open, onOpenChange }: { team: Team; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  // The team as it is now, not as it was when the dialog was opened: the
  // sidebar and Settings keep the copy they opened with, and every change made
  // here would then seem not to stick.
  const team = ws.teamById(given.id) ?? given;
  const [section, setSection] = React.useState<TeamSettingsSection>("general");
  const sections: Array<{ id: TeamSettingsSection; label: string }> = [
    { id: "general", label: "General" },
    ...(team.system ? [] : [{ id: "access" as const, label: "Access" }]),
    { id: "members", label: "Members" },
    ...(team.system ? [] : [{ id: "bookings" as const, label: "Bookings" }]),
  ];
  return (
    <SettingsDialogFrame
      title="Team settings"
      description={team.name}
      sections={sections}
      section={open ? section : null}
      // Closing goes back to General, so it opens there next time.
      onSectionChange={(next) => {
        if (next) return setSection(next);
        setSection("general");
        onOpenChange(false);
      }}
      testId="team-settings"
    >
      {section === "general" && <GeneralSection key={`${team.name}|${team.description ?? ""}`} team={team} />}
      {section === "access" && <AccessSection team={team} />}
      {section === "members" && <TeamMembersEditor team={team} heading={(add, count) => <SectionHeading label={`Members · ${count}`}>{add}</SectionHeading>} />}
      {section === "bookings" && <BookingsSection team={team} />}
    </SettingsDialogFrame>
  );
}

function SectionHeading({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** One change to the team, saved at once, everyone's copy refreshed. */
function useUpdateTeam(team: Team) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof services.workspace.updateTeam>[1]) => services.workspace.updateTeam(team.id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the team"),
  });
}

function GeneralSection({ team }: { team: Team }) {
  const ws = useWorkspace();
  const update = useUpdateTeam(team);
  const manage = canManageTeam(ws.permissions, team.id);
  const [name, setName] = React.useState(team.name);
  const [description, setDescription] = React.useState(team.description ?? "");
  const dirty = name.trim() !== team.name || description.trim() !== (team.description ?? "");
  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="ts-name">Team name</Label>
        <div className="flex items-center gap-2">
          <LookPicker color={team.color} icon={team.icon} onColor={(color) => update.mutate({ color })} onIcon={(icon) => update.mutate({ icon })} disabled={!manage} testId="team-look" />
          <Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} maxLength={60} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ts-description">Description</Label>
        <Textarea id="ts-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!manage} maxLength={200} placeholder="What does this team look after?" />
      </div>
      {manage && (
        <Button
          size="sm"
          disabled={!dirty || !name.trim() || update.isPending}
          onClick={() => update.mutate({ name: name.trim(), description: description.trim() || null }, { onSuccess: () => toast.success("Team updated") })}
          data-testid="team-save-general"
        >
          Save changes
        </Button>
      )}
      {team.system && <p className="text-2xs text-muted-foreground">A built-in team: rename or restyle it as you like. It cannot be archived.</p>}
    </div>
  );
}

/** Who can see the team's boards and who can edit them, for every board that follows the team. Admins only. */
function AccessSection({ team }: { team: Team }) {
  const ws = useWorkspace();
  const update = useUpdateTeam(team);
  const allowed = canEditTeamAccess(ws.permissions);
  const { boardVisibility, boardEdit } = teamAccessFor(team);
  const see = boardVisibility ?? "WORKSPACE";
  const edit = boardEdit ?? "ADDED";
  return (
    <div className="grid gap-3" data-testid="team-board-access">
      <p className="text-[13px] text-muted-foreground">For every board of {team.name} that follows the team; a board can set its own in its settings.</p>
      <AccessPickers
        see={see}
        edit={edit}
        teamName={team.name}
        allowPrivate={false}
        disabled={!allowed || update.isPending}
        idPrefix="team-access"
        onChange={(next) => update.mutate({ boardVisibility: next.see === "TEAM" ? "TEAM" : "WORKSPACE", boardEdit: next.edit })}
      />
      {see === "TEAM" && <p className="text-2xs text-muted-foreground">Hidden from everyone else, with its trackers and docs.</p>}
      {!allowed && <p className="text-2xs text-muted-foreground">Set by workspace admins.</p>}
      <AccessGrid see={see} edit={edit} teamName={team.name} />
    </div>
  );
}

function BookingsSection({ team }: { team: Team }) {
  const update = useUpdateTeam(team);
  return <BookingBoardSetting team={team} value={team.bookingBoardId ?? null} onChange={(bookingBoardId) => update.mutate({ bookingBoardId }, { onSuccess: () => toast.success("Saved") })} />;
}
