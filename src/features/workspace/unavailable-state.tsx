"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { AccessKind } from "@/data/repositories";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";

const NOUN: Record<AccessKind, string> = { team: "team", board: "board", tracker: "tracker", doc: "doc" };

const ASK: Record<AccessKind, string> = {
  team: "Only its members can see it. Ask a workspace admin to add you.",
  board: "Ask its owner or a workspace admin to add you.",
  tracker: "It belongs to a team only its members can see.",
  doc: "It belongs to a team only its members can see.",
};

/** The page for something this person may not open, said plainly. */
export function NoAccessState({ kind, back }: { kind: AccessKind; back: { href: string; label: string } }) {
  return (
    <EmptyState
      icon={Lock}
      title={`You don't have access to this ${NOUN[kind]}`}
      description={ASK[kind]}
      action={
        <Button variant="outline" asChild>
          <Link href={back.href}>{back.label}</Link>
        </Button>
      }
      data-testid="no-access"
    />
  );
}

/**
 * What a page shows when it could not show what was asked for. Something
 * closed to this person is simply absent to them, and "not found, it may have
 * been removed" would be untrue; so the workspace is asked which it is
 * (policies/0029 access_to) and says so. Anything that exists counts as closed:
 * an admin "viewing as" someone can see it, but the person they are looking
 * as could not.
 */
export function UnavailableState({
  kind,
  refId,
  icon,
  missing,
  back,
}: {
  kind: AccessKind;
  /** The id, or for a board its slug. */
  refId: string;
  icon: LucideIcon;
  missing: { title: string; description: string };
  back: { href: string; label: string };
}) {
  const ws = useWorkspace();
  const services = useServices();
  const answer = useQuery({
    queryKey: ["access-to", ws.workspace.id, kind, refId],
    queryFn: () => services.repos.workspaces.accessTo(kind, ws.workspace.id, refId),
    staleTime: 30_000,
  });
  if (answer.isLoading) return null;
  if (answer.data && answer.data !== "missing") return <NoAccessState kind={kind} back={back} />;
  return (
    <EmptyState
      icon={icon}
      title={missing.title}
      description={missing.description}
      action={
        <Button variant="outline" asChild>
          <Link href={back.href}>{back.label}</Link>
        </Button>
      }
    />
  );
}
