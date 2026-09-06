"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH, invitationStatusMessage, type InvitationPreview } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { AvatarError, uploadAvatar } from "@/features/profile/avatar-upload";
import { formatDateTime } from "@/lib/dates/dates";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { routes } from "@/lib/routes";

const schema = z
  .object({
    firstName: z.string().trim().min(1, "Required").max(80),
    lastName: z.string().trim().min(1, "Required").max(80),
    jobTitle: z.string().trim().max(120).optional(),
    password: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`).max(72, "At most 72 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords do not match", path: ["confirm"] });

type FormValues = z.infer<typeof schema>;

/**
 * Finishing onboarding from an invitation link.
 *
 * The person has no session yet, so everything up to "Create my account" goes
 * through the token alone. On success the app signs them in with the password
 * they just chose, stores the optional photo as the now-signed-in user (the
 * avatar bucket only accepts writes from the account itself), and lands them in
 * the workspace.
 */
export function OnboardingScreen({ token }: { token: string }) {
  const services = useServices();
  const preview = useQuery({
    queryKey: queryKeys.invitationPreview(token),
    queryFn: () => services.workspace.previewInvitation(token),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <AuthShell
      headline="You have been invited."
      lead="Set a password and tell the team who you are. It takes a minute, and you only do it once."
      footnote="Boards, briefs and approvals in one place."
      cardTestId="onboarding-card"
      progress={preview.isLoading}
    >
          {preview.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" /> Checking your invitation…
            </div>
          ) : preview.isError ? (
            <Unusable title="Could not check this invitation" message={preview.error instanceof Error ? preview.error.message : "Try again in a moment."} retry={() => void preview.refetch()} />
          ) : preview.data?.status === "PENDING" ? (
            <OnboardingForm token={token} invitation={preview.data} />
          ) : (
            <Unusable title={unusableTitle(preview.data?.status)} message={invitationStatusMessage(preview.data?.status ?? "INVALID")} />
          )}
    </AuthShell>
  );
}

function unusableTitle(status: InvitationPreview["status"] | undefined): string {
  switch (status) {
    case "ACCEPTED":
      return "This invitation has already been used";
    case "EXPIRED":
      return "This invitation has expired";
    case "REVOKED":
      return "This invitation was replaced";
    default:
      return "This link does not work";
  }
}

function Unusable({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return (
    <div className="space-y-4" data-testid="onboarding-unusable">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href={routes.login()}>Go to sign in</Link>
        </Button>
        {retry && (
          <Button variant="ghost" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

type Phase = "form" | "creating" | "signing-in" | "photo" | "done";

function OnboardingForm({ token, invitation }: { token: string; invitation: Extract<InvitationPreview, { status: "PENDING" }> }) {
  const router = useRouter();
  const services = useServices();
  const { providerKind } = useDataContext();
  const { signIn } = useAuth();
  const queryClient = useQueryClient();
  const [phase, setPhase] = React.useState<Phase>("form");
  const [error, setError] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: invitation.firstName, lastName: invitation.lastName, jobTitle: invitation.jobTitle ?? "", password: "", confirm: "" },
  });

  React.useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image.");
      return;
    }
    setError(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const complete = useMutation({
    mutationFn: async (values: FormValues) => {
      setError(null);
      setPhase("creating");
      const { email, userId } = await services.workspace.completeOnboarding({
        token,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        jobTitle: values.jobTitle || null,
      });

      setPhase("signing-in");
      await signIn(email, values.password);
      queryClient.removeQueries({ queryKey: queryKeys.invitationPreview(token) });

      if (photo) {
        setPhase("photo");
        try {
          const { url } = await uploadAvatar(providerKind, userId, photo.file);
          await services.profiles.updateProfile(userId, { avatarUrl: url });
        } catch (e) {
          // The account is fine; the photo can be added from the profile page.
          console.warn("[onboarding] avatar upload failed", e);
        }
      }
      publishDataChange({ kinds: ["workspace"] });
      setPhase("done");
      return invitation.workspaceSlug;
    },
    onSuccess: (slug) => router.replace(routes.workspace(slug)),
    onError: (e) => {
      setPhase("form");
      setError(e instanceof AvatarError || e instanceof Error ? e.message : "Something went wrong. Try again.");
    },
  });

  const busy = phase !== "form";
  const watchedFirst = useWatch({ control: form.control, name: "firstName" }) || invitation.firstName;
  const watchedLast = useWatch({ control: form.control, name: "lastName" }) || invitation.lastName;
  const previewUser = {
    id: "preview",
    firstName: watchedFirst,
    lastName: watchedLast,
    displayName: `${watchedFirst} ${watchedLast}`.trim(),
    avatarUrl: photo?.url ?? null,
  };

  if (phase !== "form") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite" data-testid="onboarding-progress">
        {phase === "done" ? <CheckCircle2 className="size-8 text-green-600" /> : <LoaderCircle className="size-6 animate-spin text-muted-foreground" />}
        <p className="text-[13px] text-muted-foreground">
          {phase === "creating" && "Creating your account…"}
          {phase === "signing-in" && "Signing you in…"}
          {phase === "photo" && "Saving your photo…"}
          {phase === "done" && "All set. Opening your workspace…"}
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((v) => complete.mutate(v))} noValidate>
      <div>
        <h2 className="text-lg font-semibold">Welcome to {invitation.workspaceName}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You are joining as <span className="font-medium text-foreground">{invitation.email}</span>. Choose a password and check your details to finish.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <UserAvatar user={previewUser} size="xl" tooltip={false} className="size-16 text-base" />
        <div className="space-y-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Choose a profile photo"
            data-testid="onboarding-avatar-input"
            onChange={(event) => {
              choosePhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImagePlus /> {photo ? "Change photo" : "Add a photo"}
            </Button>
            {photo && (
              <Button type="button" variant="ghost" size="sm" aria-label="Remove photo" onClick={() => setPhoto(null)} disabled={busy}>
                <Trash2 />
              </Button>
            )}
          </div>
          <p className="text-2xs text-muted-foreground">Optional. Square crop, stored as WebP.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ob-first">First name</Label>
          <Input id="ob-first" autoComplete="given-name" {...form.register("firstName")} aria-invalid={!!form.formState.errors.firstName} />
          {form.formState.errors.firstName && <p className="text-2xs text-destructive">{form.formState.errors.firstName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-last">Last name</Label>
          <Input id="ob-last" autoComplete="family-name" {...form.register("lastName")} aria-invalid={!!form.formState.errors.lastName} />
          {form.formState.errors.lastName && <p className="text-2xs text-destructive">{form.formState.errors.lastName.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ob-title">Job title</Label>
          <Input id="ob-title" placeholder="Optional, e.g. Graphic Designer" autoComplete="organization-title" {...form.register("jobTitle")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-password">Password</Label>
          <Input id="ob-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!form.formState.errors.password} data-testid="onboarding-password" />
          {form.formState.errors.password ? (
            <p className="text-2xs text-destructive">{form.formState.errors.password.message}</p>
          ) : (
            <p className="text-2xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-confirm">Confirm password</Label>
          <Input id="ob-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} aria-invalid={!!form.formState.errors.confirm} data-testid="onboarding-confirm" />
          {form.formState.errors.confirm && <p className="text-2xs text-destructive">{form.formState.errors.confirm.message}</p>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-destructive" data-testid="onboarding-error">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy} data-testid="onboarding-submit">
        Create my account
      </Button>
      <p className="text-2xs text-muted-foreground">
        This link is for you alone and stops working once used. It expires {formatDateTime(invitation.expiresAt)}.
      </p>
    </form>
  );
}
