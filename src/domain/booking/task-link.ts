import type { EntityId } from "@/domain/common/types";

/**
 * The link a booking's receipt can give its requester: their task, read-only,
 * for as long as the task exists, open, done or archived.
 *
 * `<task id>.<signature>`: the signature is an HMAC of the task id with a
 * secret only the server holds (src/server/booking-task-link.ts), so the link
 * cannot be guessed, and it is the same every time it is worked out for the
 * same task, with nothing stored that could be changed or switched off. The
 * form's own switch (review.shareTaskLink) decides whether it opens.
 */
export const TASK_LINK_SIGNATURE_LENGTH = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function taskLinkToken(itemId: EntityId, signature: string): string {
  return `${itemId}.${signature}`;
}

/** The task id and signature in a link, or null when it is not the shape of one. */
export function parseTaskLinkToken(token: string): { itemId: EntityId; signature: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const itemId = token.slice(0, dot).toLowerCase();
  const signature = token.slice(dot + 1);
  if (!UUID.test(itemId) || !new RegExp(`^[0-9a-f]{${TASK_LINK_SIGNATURE_LENGTH}}$`).test(signature)) return null;
  return { itemId, signature };
}

/** Where the link opens, under the workspace's own address. */
export function taskLinkPath(workspaceSlug: string, token: string): string {
  return `/${encodeURIComponent(workspaceSlug)}/booking/t/${token}`;
}
