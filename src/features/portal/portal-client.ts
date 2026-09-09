"use client";

import type { PortalContext, PortalTaskPage } from "@/domain";

/**
 * What the portal page holds on to between calls.
 *
 * The credentials, and nothing else: the reads and writes themselves go through
 * `services.portals.public*`, which uses the HTTP transport under Supabase and
 * runs directly under the local provider. That is what lets the end-to-end
 * suite drive the genuine gate rather than a stand-in.
 */
export interface PortalCredentials {
  token: string;
  password: string | null;
  credentialVersion?: number;
  /**
   * Who is asking, on the local provider only.
   *
   * The Supabase transport drops this: a browser claiming to be somebody is not
   * evidence of anything, and the server resolves the viewer from a bearer
   * token it verifies itself.
   */
  viewer?: { userId: string; displayName: string; isWorkspaceMember: boolean } | null;
}

export interface PortalTasksResponse extends PortalTaskPage {
  context: PortalContext;
}

/**
 * A submission key: one booking's identity, made before it is sent.
 *
 * The browser makes it so a retry after a dropped connection can be recognised
 * as the same booking rather than a second one. It is scoped to the portal by
 * the server, so two departments cannot collide on a key.
 */
export function newSubmissionKey(): string {
  return `sub-${crypto.randomUUID()}`;
}
