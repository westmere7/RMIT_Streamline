"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useServices } from "@/features/data/data-context";
import { ShareClosed, ShareGuestProviders, SharePasswordPrompt, SharePlaceholder, ShareSignIn, SHARE_REFRESH_MS } from "@/features/share/share-shell";
import { SharedBoardScreen } from "@/features/share/shared-board-screen";
import { routes } from "@/lib/routes";
import { ShareAccessError } from "@/services";

/**
 * The page behind a board link.
 *
 * Four steps, in order: ask what the link is (live, expired, password, who it
 * opens for), send anyone a private link does not know to sign in, take the
 * password if it wants one, then read the board and render it. Nothing about the
 * board is fetched until the link has answered for itself, and the whole page is
 * read-only by construction — the repositories behind it refuse to write, so no
 * button can do damage even if one were left on screen.
 */
export function SharedBoardPage({ token }: { token: string }) {
  const services = useServices();
  const [password, setPassword] = React.useState<string | null>(null);

  const gate = useQuery({
    queryKey: ["share-gate", token],
    queryFn: () => services.shares.gate(token),
    retry: false,
    staleTime: 60_000,
  });
  const needsPassword = gate.data?.needsPassword ?? false;
  // The board carries on moving while somebody is reading it, so the payload is
  // fetched again on a short cycle and whenever the tab is looked at again.
  // There is no session here for a realtime subscription to ride on, and the
  // whole board is one request, so polling is both the simplest and the only
  // honest way to keep the page current.
  const payload = useQuery({
    queryKey: ["share-board", token],
    queryFn: () => services.shares.load(token, password),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: SHARE_REFRESH_MS,
    refetchInterval: SHARE_REFRESH_MS,
    // Only while the tab is in front; a link left open behind other windows
    // costs nothing.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  if (gate.isPending) return <SharePlaceholder label="Opening the shared board…" />;

  if (gate.isError || !gate.data?.open) {
    const message =
      gate.data?.refusal === "expired"
        ? "This link has expired. Ask whoever sent it for a new one."
        : gate.data?.refusal === "off"
          ? "Sharing has been turned off for this board. Ask whoever sent you the link to turn it back on."
          : "This link does not open anything. Check that you copied all of it, or ask whoever sent it for a new one.";
    return <ShareClosed title="This link does not open a board" message={message} />;
  }

  if (payload.data) {
    return (
      <ShareGuestProviders payload={payload.data} path={routes.share(token)}>
        <SharedBoardScreen payload={payload.data} />
      </ShareGuestProviders>
    );
  }

  const refusal = payload.error instanceof ShareAccessError ? payload.error.reason : null;
  if (refusal === "signin") return <ShareSignIn what="board" path={routes.share(token)} />;
  if (needsPassword && (password === null || refusal === "password")) {
    return <SharePasswordPrompt what="board" busy={payload.isFetching} wrong={refusal === "password"} onSubmit={setPassword} />;
  }
  if (payload.isError) {
    return <ShareClosed title="This board could not be opened" message={payload.error instanceof Error ? payload.error.message : "Ask whoever sent the link for a new one."} />;
  }
  return <SharePlaceholder label="Opening the shared board…" />;
}
