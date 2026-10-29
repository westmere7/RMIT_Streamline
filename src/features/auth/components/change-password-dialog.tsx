"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";

/** The signed-in person changes their own password: the current one, then the new one twice. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="change-password-dialog">
        {/* Mounted only while open, so nothing typed survives a close. */}
        {open && <ChangePasswordForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Said as the person types, so the button is never the first to object.
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
  const tooLong = next.length > 72;
  const mismatch = confirm.length > 0 && confirm !== next;
  const same = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= PASSWORD_MIN_LENGTH && !tooLong && confirm === next && !same;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!changePassword) throw new Error("Passwords cannot be changed here.");
      await changePassword({ currentPassword: current, newPassword: next });
      toast.success("Password changed", { description: "Other devices are signed out." });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>Other devices will be signed out.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus data-testid="pw-current" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={tooShort || tooLong || same} data-testid="pw-new" />
          <p className={tooShort || tooLong || same ? "text-2xs text-destructive" : "text-2xs text-muted-foreground"}>
            {same ? "Choose a different password." : tooLong ? "At most 72 characters." : `At least ${PASSWORD_MIN_LENGTH} characters.`}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} data-testid="pw-confirm" />
          {mismatch && <p className="text-2xs text-destructive">The two passwords do not match.</p>}
        </div>
        {error && (
          <p className="text-[13px] text-destructive" role="alert" data-testid="pw-error">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || busy} data-testid="pw-submit">
          {busy && <Loader2 className="animate-spin" />} Change password
        </Button>
      </DialogFooter>
    </form>
  );
}
