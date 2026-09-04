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
import { useDataContext, useServices } from "@/features/data/data-context";
import { IS_DEV } from "@/lib/config";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function LoginScreen() {
  const router = useRouter();
  const { signIn, status } = useAuth();
  const { providerKind } = useDataContext();
  const services = useServices();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  // Supabase authenticates with a password; local mode signs in by email alone.
  const needsPassword = providerKind === "supabase";

  const accounts = useQuery({
    queryKey: ["login-accounts"],
    queryFn: async () => {
      const users = await services.repos.users.list();
      return users.filter((u) => u.deactivatedAt === null);
    },
    enabled: providerKind === "local",
  });

  React.useEffect(() => {
    if (status === "signed-in") router.replace(routes.root());
  }, [status, router]);

  const submit = async (target: string, secret?: string) => {
    setError(null);
    setPendingEmail(target);
    try {
      await signIn(target, secret);
      router.replace(routes.root());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
      setPendingEmail(null);
    }
  };

  return (
    <main className="flex min-h-screen bg-surface">
      <section className="hidden w-[420px] shrink-0 flex-col justify-between bg-navy p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold">R</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Streamline</p>
            <p className="text-xs text-white/70">RMIT Creative Team</p>
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold leading-snug">Boards, briefs and approvals in one place.</h1>
          <p className="text-sm text-white/70">
            Track campaign production, creative requests and publication work across the Melbourne and Vietnam studios.
          </p>
        </div>
        <p className="text-xs text-white/50">
          {needsPassword ? "Connected to Supabase · data is shared across the workspace." : "Local development build · data is stored in this browser."}
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Sign in</h2>
            <p className="text-[13px] text-muted-foreground">
              {providerKind === "local"
                ? "Development mode. Choose a seeded account or enter its email — no password required."
                : "Enter your credentials to continue."}
            </p>
          </div>

          {providerKind === "local" && (
            <>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Seeded accounts">
                {accounts.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-surface-strong" />)}
                {accounts.data?.map((user) => {
                  const pending = pendingEmail === user.email;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => submit(user.email)}
                      disabled={pendingEmail !== null}
                      data-testid={`login-${user.firstName.toLowerCase()}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-xs transition-[background-color,border-color,box-shadow] hover:border-ring/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                        pending && "border-ring bg-accent",
                      )}
                    >
                      <UserAvatar user={user} size="lg" tooltip={false} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                        <span className="block truncate text-2xs text-muted-foreground">{user.jobTitle}</span>
                      </span>
                      {pending ? (
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ArrowRight className="size-4 text-muted-foreground/60" />
                      )}
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
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void submit(email.trim(), needsPassword ? password : undefined);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="danh@rmit.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {needsPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-[13px] text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!email.trim() || (needsPassword && !password) || pendingEmail !== null}>
              {pendingEmail !== null ? <LoaderCircle className="animate-spin" /> : null} Continue
            </Button>
            {needsPassword && IS_DEV && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEmail("admin@rmit.local");
                    setPassword("admin");
                  }}
                  data-testid="login-fill-admin"
                >
                  Use the admin test account
                </Button>
                <p className="text-2xs text-muted-foreground">
                  Demo accounts: <code>admin@rmit.local</code> / <code>admin</code>, or any of danh, emily, joanne … <code>@rmit.local</code> with{" "}
                  <code>Password123!</code>
                </p>
              </>
            )}
            {providerKind === "local" && (
              <p className="text-2xs text-muted-foreground">
                Seeded accounts: danh, emily, jun, joanne, duc, tuyet, hil, grace, jane @rmit.local
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
