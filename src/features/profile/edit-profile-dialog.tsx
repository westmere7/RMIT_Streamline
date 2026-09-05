"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User } from "@/domain";
import { useProfileMutations } from "@/features/profile/hooks";

/** Timezones the studios actually work in, plus whatever the profile already had. */
const TIMEZONES = ["Australia/Melbourne", "Australia/Sydney", "Asia/Ho_Chi_Minh", "Asia/Singapore", "Asia/Bangkok", "Europe/London", "UTC"];

export interface EditProfileDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Edits one person's details. Who may open it is decided by the caller; the database enforces it too. */
export function EditProfileDialog({ user, open, onOpenChange }: EditProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="edit-profile-dialog">
        {/* Mounted only while open, so the form re-initialises from the user each time. */}
        {open && <ProfileForm user={user} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({ user, onClose }: { user: User; onClose: () => void }) {
  const { save, changeAvatar, removeAvatar } = useProfileMutations(user.id);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [form, setForm] = React.useState({
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    jobTitle: user.jobTitle ?? "",
    department: user.department ?? "",
    timezone: user.timezone,
  });

  const zones = TIMEZONES.includes(user.timezone) ? TIMEZONES : [user.timezone, ...TIMEZONES];
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    save.mutate(
      {
        firstName: form.firstName,
        lastName: form.lastName,
        displayName: form.displayName,
        jobTitle: form.jobTitle,
        department: form.department,
        timezone: form.timezone,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Name, contact details and photo. Images are converted to WebP before they are stored.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4 py-2">
        <UserAvatar user={user} size="xl" tooltip={false} className="size-16 text-base" />
        <div className="space-y-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Choose a profile photo"
            data-testid="avatar-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) changeAvatar.mutate(file);
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={changeAvatar.isPending} onClick={() => fileRef.current?.click()} data-testid="avatar-upload">
              {changeAvatar.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />} {user.avatarUrl ? "Replace photo" : "Upload photo"}
            </Button>
            {user.avatarUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={removeAvatar.isPending} onClick={() => removeAvatar.mutate()} aria-label="Remove photo">
                <Trash2 />
              </Button>
            )}
          </div>
          <p className="text-2xs text-muted-foreground">Square crop, 256px, WebP.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="firstName" label="First name" value={form.firstName} onChange={(v) => set({ firstName: v })} />
        <Field id="lastName" label="Last name" value={form.lastName} onChange={(v) => set({ lastName: v })} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} required data-testid="profile-display-name" />
        </div>
        <Field id="jobTitle" label="Job title" value={form.jobTitle} onChange={(v) => set({ jobTitle: v })} />
        <Field id="department" label="Department" value={form.department} onChange={(v) => set({ department: v })} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            value={form.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className="h-9 w-full rounded-lg border border-border bg-transparent px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
        <p className="text-2xs text-muted-foreground sm:col-span-2">
          Email is <span className="font-medium">{user.email}</span> — sign-in addresses are changed in Supabase Auth.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!form.displayName.trim() || save.isPending} data-testid="profile-save">
          {save.isPending ? <Loader2 className="animate-spin" /> : null} Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
