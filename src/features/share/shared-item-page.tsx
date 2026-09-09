"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import type { PublicItemPayload } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { ShareClosed, ShareGuestProviders, SharePasswordPrompt, SharePlaceholder, ShareSignIn, SHARE_REFRESH_MS } from "@/features/share/share-shell";
import { SharedItemScreen } from "@/features/share/shared-item-screen";
import { ShareAccessError } from "@/services";
import { routes } from "@/lib/routes";

/**
 * The page behind a link to one task.
 *
 * The same three steps as a shared board — ask what the link is, take the
 * password if it wants one, then read what is behind it — with one more door:
 * a private link is only opened for someone signed in as a member of the
 * workspace, which the server decides, not this page.
 */
export function SharedItemPage({ token }: { token: string }) {
  const services = useServices();
  const [password, setPassword] = React.useState<string | null>(null);

  const gate = useQuery({
    queryKey: ["item-share-gate", token],
    queryFn: () => services.itemShares.gate(token),
    retry: false,
    staleTime: 60_000,
  });
  const needsPassword = gate.data?.needsPassword ?? false;
  const payload = useQuery({
    queryKey: ["share-item", token],
    queryFn: () => services.itemShares.load(token, password),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: SHARE_REFRESH_MS,
    refetchInterval: SHARE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  if (gate.isPending) return <SharePlaceholder label="Opening the shared task…" />;

  if (gate.isError || !gate.data?.open) {
    const message =
      gate.data?.refusal === "expired"
        ? "This link has expired. Ask whoever sent it for a new one."
        : gate.data?.refusal === "off"
          ? "Sharing has been turned off for this task. Ask whoever sent you the link to turn it back on."
          : "This link does not open anything. Check that you copied all of it, or ask whoever sent it for a new one.";
    return <ShareClosed title="This link does not open a task" message={message} />;
  }

  if (payload.data) {
    return (
      <ShareGuestProviders payload={payload.data} path={routes.itemShare(token)}>
        <SharedItemScreen payload={payload.data} />
      </ShareGuestProviders>
    );
  }

  const refusal = payload.error instanceof ShareAccessError ? payload.error.reason : null;
  if (refusal === "signin") return <ShareSignIn what="task" path={routes.itemShare(token)} />;
  if (needsPassword && (password === null || refusal === "password")) {
    return <SharePasswordPrompt what="task" busy={payload.isFetching} wrong={refusal === "password"} onSubmit={setPassword} />;
  }
  if (payload.isError) {
    return <ShareClosed title="This task could not be opened" message={payload.error instanceof Error ? payload.error.message : "Ask whoever sent the link for a new one."} />;
  }
  return <SharePlaceholder label="Opening the shared task…" />;
}

export type { PublicItemPayload };
