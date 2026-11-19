"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardPen, Copy, ExternalLink, Globe } from "lucide-react";
import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServices } from "@/features/data/data-context";
import { copyToClipboard } from "@/features/members/hooks";
import { portalKeys, portalUrl } from "@/features/portal/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The portal's token and whether its two doors are serving, for Home. Under the
 * portal's own key, so a change made on Portal and Booking refreshes it too.
 */
export function usePortalLinks() {
  const ws = useWorkspace();
  const services = useServices();
  const workspaceId = ws.workspace.id;
  return useQuery({
    queryKey: [...portalKeys(workspaceId), "links"],
    queryFn: () => services.portals.links(workspaceId),
    enabled: ws.permissions.workspaceRole !== "GUEST" && ws.workspace.showPortalMenu !== false,
    staleTime: 60_000,
  });
}

/**
 * The portal and the booking form, to open or copy without going to Portal and
 * Booking. Nothing when there is no portal yet, for a guest, or where the
 * workspace has the portal menu off.
 */
export function PortalLinks({ heading, className }: { heading?: React.ReactNode; className?: string }) {
  const ws = useWorkspace();
  const links = usePortalLinks();
  if (ws.permissions.workspaceRole === "GUEST" || ws.workspace.showPortalMenu === false) return null;
  if (links.isLoading) {
    return (
      <section>
        {heading}
        <div className={cn("space-y-1", className)} aria-busy aria-label="Loading the portal links">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      </section>
    );
  }
  if (!links.data) return null;
  const { token, enabled, allowBooking } = links.data;
  const url = portalUrl(token);
  return (
    <section>
      {heading}
      <ul className={cn("space-y-1", className)} data-testid="home-portal-links">
        <LinkRow icon={Globe} label="Portal" href={routes.portal(token)} url={url} serving={enabled} testId="home-portal-link" />
        <LinkRow icon={ClipboardPen} label="Booking form" href={`${routes.portal(token)}/book`} url={`${url}/book`} serving={enabled && allowBooking} testId="home-booking-link" />
      </ul>
    </section>
  );
}

function LinkRow({
  icon: Icon,
  label,
  href,
  url,
  serving,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  url: string;
  serving: boolean;
  testId: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <li className="group flex h-11 items-center md:h-10 gap-1 rounded-md hover:bg-accent">
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-[13px]" data-testid={testId}>
        <Icon className={cn("size-4 shrink-0", serving ? "text-foreground/80" : "text-muted-foreground")} />
        <span className={cn("truncate font-medium", !serving && "text-muted-foreground")}>{label}</span>
        {!serving && <span className="shrink-0 text-2xs text-muted-foreground">Not serving</span>}
        <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      </a>
      <button
        type="button"
        className="mr-1 flex size-9 shrink-0 md:size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        aria-label={`Copy the ${label.toLowerCase()} link`}
        title="Copy link"
        onClick={() => {
          void copyToClipboard(url, "Link copied");
          setCopied(true);
        }}
        data-testid={`${testId}-copy`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </li>
  );
}
