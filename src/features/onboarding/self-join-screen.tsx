"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELF_JOIN_MESSAGES } from "@/domain";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { useServices } from "@/features/data/data-context";
import { routes } from "@/lib/routes";

const schema = z.object({
  firstName: z.string().trim().min(1, "Required").max(80),
  lastName: z.string().trim().min(1, "Required").max(80),
  email: z.email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

/**
 * The workspace's join link. The person types who they are; a new email is
 * added as a pending member, and they carry on to their own personal link to
 * set a password, exactly as somebody an admin added would.
 */
export function SelfJoinScreen({ joinKey }: { joinKey: string }) {
  const services = useServices();
  const preview = useQuery({ queryKey: ["self-join", joinKey], queryFn: () => services.workspace.previewSelfJoin(joinKey), retry: false, staleTime: Infinity });

  return (
    <AuthShell
      headline="Join the team."
      lead="Tell us who you are. Next you set a password, and you are in."
      footnote="Boards, briefs and approvals in one place."
      cardTestId="self-join-card"
      progress={preview.isLoading}
    >
      {preview.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" /> Checking the link…
        </div>
      ) : preview.data?.valid ? (
        <SelfJoinForm joinKey={joinKey} workspaceName={preview.data.workspaceName} />
      ) : (
        <div className="space-y-4" data-testid="self-join-unusable">
          <div>
            <h2 className="text-lg font-semibold">This link does not work</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{preview.isError && preview.error instanceof Error ? preview.error.message : SELF_JOIN_MESSAGES.off}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={routes.login()}>Go to sign in</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}

function SelfJoinForm({ joinKey, workspaceName }: { joinKey: string; workspaceName: string | null }) {
  const router = useRouter();
  const services = useServices();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { firstName: "", lastName: "", email: "" } });
  const join = useMutation({
    mutationFn: (values: FormValues) => services.workspace.selfJoin({ key: joinKey, ...values }),
    onSuccess: ({ token }) => router.push(routes.join(token)),
  });
  const error = join.error instanceof Error ? join.error.message : null;
  const signIn = error === SELF_JOIN_MESSAGES.member;

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => join.mutate(values))} data-testid="self-join-form">
      <div>
        <h2 className="text-lg font-semibold">{workspaceName ? `Join ${workspaceName}` : "Join the workspace"}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="self-join-first">First name</Label>
          <Input id="self-join-first" autoFocus autoComplete="given-name" {...form.register("firstName")} aria-invalid={!!form.formState.errors.firstName} data-testid="self-join-first" />
          {form.formState.errors.firstName && <p className="text-2xs text-destructive">{form.formState.errors.firstName.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="self-join-last">Last name</Label>
          <Input id="self-join-last" autoComplete="family-name" {...form.register("lastName")} aria-invalid={!!form.formState.errors.lastName} data-testid="self-join-last" />
          {form.formState.errors.lastName && <p className="text-2xs text-destructive">{form.formState.errors.lastName.message}</p>}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="self-join-email">Work email</Label>
        <Input id="self-join-email" type="email" autoComplete="email" placeholder="name@rmit.edu.au" {...form.register("email")} aria-invalid={!!form.formState.errors.email} data-testid="self-join-email" />
        {form.formState.errors.email && <p className="text-2xs text-destructive">{form.formState.errors.email.message}</p>}
      </div>
      {error && (
        <p className="text-[13px] text-destructive" role="alert" data-testid="self-join-error">
          {error} {signIn && <Link href={routes.login()} className="font-medium underline underline-offset-4">Sign in</Link>}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={join.isPending} data-testid="self-join-submit">
        {join.isPending ? <LoaderCircle className="animate-spin" /> : null} Continue
      </Button>
    </form>
  );
}
