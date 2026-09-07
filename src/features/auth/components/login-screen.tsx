"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell, SessionProgress } from "@/features/auth/components/auth-shell";
import { useDataContext, useServices } from "@/features/data/data-context";
import { IS_DEV } from "@/lib/config";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Sign in. The screen owns the whole journey into the app: while the saved
 * session is checked, while a sign-in completes and while the workspace is
 * looked up, the card stays on screen and reports progress, then the browser
 * goes straight to the workspace. No blank page in between.
 */
export function LoginScreen() {
  const router = useRouter();
  const { signIn, status, user } = useAuth();
  const { providerKind } = useDataContext();
  const services = useServices();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  // Supabase authenticates with a password; local mode signs in by email alone.
  const needsPassword = providerKind === "supabase";

  // Only people who have finished onboarding: pending members have no password yet.
  const accounts = useQuery({
    queryKey: queryKeys.signInAccounts,
    queryFn: () => services.workspace.listSignInAccounts(),
    enabled: providerKind === "local",
  });

  // Once signed in (from a saved session or just now), find the workspace and go.
  const workspaces = useQuery({
    queryKey: ["user-workspaces", user?.id],
    queryFn: () => services.workspace.listWorkspacesForUser(user!.id),
    enabled: status === "signed-in" && !!user,
  });
  const destination = workspaces.data?.[0];
  const noWorkspace = status === "signed-in" && workspaces.isSuccess && !destination;
  React.useEffect(() => {
    if (destination) router.replace(routes.workspace(destination.slug));
  }, [destination, router]);

  const submit = async (target: string, secret?: string) => {
    setError(null);
    setPendingEmail(target);
    try {
      await signIn(target, secret);
      // The effect above takes it from here once the session and workspace resolve.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
      setPendingEmail(null);
    }
  };

  // What the card is doing right now, if anything, and which of the three steps that is.
  const progress: { message: string; withUser: boolean; step: 1 | 2 | 3 } | null =
    status === "loading"
      ? { message: "Checking your session", withUser: false, step: 1 }
      : status === "signed-in" && !noWorkspace
        ? destination
          ? { message: `Opening ${destination.name}`, withUser: true, step: 3 }
          : { message: "Finding your workspace", withUser: true, step: 2 }
        : pendingEmail !== null
          ? { message: "Signing you in", withUser: false, step: 1 }
          : null;
  const busy = progress !== null;

  return (
    <AuthShell
      headline="Boards, briefs and approvals in one place."
      lead="Track campaign production, creative requests and publication work across the Melbourne and Vietnam teams."
      footnote={
        <span className="inline-flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", needsPassword ? "bg-green-400" : "bg-amber-300")} />
          {needsPassword ? "Connected to Supabase · data is shared across the workspace" : "Local development build · data stays in this browser"}
        </span>
      }
      cardTestId="login-card"
    >
      <div className="mb-6">
        <p className="mb-1 text-2xs font-semibold tracking-[0.12em] text-primary uppercase">RMIT Creative Team</p>
        <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {providerKind === "local" ? "Development mode: choose a seeded account, or enter its email. No password needed." : "Use your email and password. New here? Open the invitation link your workspace admin sent you."}
        </p>
      </div>

      {progress && (
        <div className="mb-5">
          <SessionProgress user={progress.withUser ? user : null} message={progress.message} step={progress.step} />
        </div>
      )}
      {noWorkspace && (
        <p role="alert" className="mb-5 rounded-xl border border-amber-300/50 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Your account is not in a workspace yet. Ask a workspace admin for an invitation link.
        </p>
      )}

      <div className={cn("transition-opacity duration-200", busy && "pointer-events-none opacity-50")} aria-busy={busy}>
        {providerKind === "local" && (
          <>
            <div className="scrollbar-thin grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-2" aria-label="Seeded accounts">
              {accounts.isLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-strong" />)}
              {accounts.data?.map((account) => {
                const pending = pendingEmail === account.email;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => submit(account.email)}
                    disabled={busy}
                    data-testid={`login-${account.firstName.toLowerCase()}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-xs transition-[background-color,border-color,box-shadow] hover:border-ring/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                      pending && "border-ring bg-accent",
                    )}
                  >
                    <UserAvatar user={account} size="lg" tooltip={false} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-medium">{account.displayName}</span>
                      <span className="block truncate text-2xs text-muted-foreground">{account.jobTitle}</span>
                    </span>
                    {pending ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : <ArrowRight className="size-4 text-muted-foreground/60" />}
                  </button>
                );
              })}
            </div>
            <div className="my-5 flex items-center gap-3 text-2xs text-muted-foreground">
              <Separator className="flex-1" />
              or use an email
              <Separator className="flex-1" />
            </div>
          </>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void submit(email.trim(), needsPassword ? password : undefined);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" autoFocus placeholder="you@rmit.edu.au" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
          </div>
          {needsPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" data-testid="login-password" />
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="group w-full" disabled={!email.trim() || (needsPassword && !password) || busy}>
            {pendingEmail !== null ? <LoaderCircle className="animate-spin" /> : null} Continue <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
          {needsPassword && IS_DEV && (
            <details className="group rounded-xl border border-border/60 bg-surface/60 px-3.5 py-2.5 text-2xs text-muted-foreground">
              <summary className="cursor-pointer list-none font-medium text-foreground/80 select-none">Demo accounts</summary>
              <div className="mt-2 space-y-2">
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setEmail("admin@rmit.local"); setPassword("admin123"); }} data-testid="login-fill-admin">
                  Use the admin test account
                </Button>
                <p>
                  <code>admin@rmit.local</code> / <code>admin123</code>, or danh, emily, joanne … <code>@rmit.local</code> with <code>Password123!</code>
                </p>
              </div>
            </details>
          )}
          {providerKind === "local" && <p className="text-2xs text-muted-foreground">Seeded accounts: danh, emily, jun, joanne, duc, tuyet, hil, grace, jane @rmit.local</p>}
        </form>
      </div>
    </AuthShell>
  );
}
