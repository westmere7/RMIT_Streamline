import { z } from "zod";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices, type Services } from "@/services";
import { PortalAccessError, PortalSubmissionError, type PortalViewer, type ResolvedPortal } from "@/services/stakeholder-portal-service";
import { bookingRequestSchema } from "@/services/booking";
import { HttpError } from "./http";

/**
 * The stakeholder portal for the Supabase provider.
 *
 * A stakeholder has no account, so RLS has nobody to reason about and the reads
 * run with the service role — the same arrangement the share links use. What
 * makes that safe is that the service role is never handed a request's own
 * words: every call resolves the portal from the token first, and the resolved
 * department is what scopes everything after it.
 *
 * The client override is process-wide, so nothing request-specific may be put
 * into it. It carries one thing — the admin client, a singleton with no user
 * state — and the caller's identity travels as an argument instead.
 */

/** The grant a visitor presents. The password is in the body, never the URL. */
export const portalGrantSchema = z.object({
  password: z.string().max(200).nullable().optional(),
  /** The version the tab was admitted under; a stale one is refused. */
  credentialVersion: z.number().int().positive().optional(),
});

export const portalTasksSchema = portalGrantSchema.extend({
  cursor: z.string().max(200).nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  search: z.string().max(200).optional(),
});

export const portalBookSchema = portalGrantSchema.extend({
  submissionKey: z.string().min(8).max(100),
  request: bookingRequestSchema,
});

export const portalCommentSchema = portalGrantSchema.extend({
  itemId: z.string().uuid(),
  body: z.string().min(1).max(20_000),
});

export const portalAssetSchema = portalGrantSchema.extend({
  itemId: z.string().uuid(),
  assetId: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).max(200).optional(),
    quantity: z.number().int().min(0).max(100_000).nullable().optional(),
    dueDate: z.string().max(30).nullable().optional(),
    completedAt: z.string().max(40).nullable().optional(),
  }),
});

/** The services, pointed at the service role. Built per call; the client is a singleton. */
export function portalServices(): Services {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createServices(createSupabaseRepositories());
}

/**
 * Who is knocking, when anyone says so.
 *
 * The bearer token is verified against Supabase Auth — a claim in the body is
 * not evidence of anything — and membership is read for the portal's own
 * workspace, not for any workspace. Somebody signed in to a different workspace
 * is a visitor here, which is the whole point of checking the id rather than
 * the fact of a session.
 */
export async function portalViewer(request: Request, workspaceId: string): Promise<PortalViewer | null> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) return null;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;

  const membership = await admin
    .from("workspace_members")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", data.user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  const profile = await admin.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();

  return {
    userId: data.user.id,
    displayName: (profile.data as { display_name?: string } | null)?.display_name ?? "",
    isWorkspaceMember: !!membership.data,
  };
}

/**
 * Admits a caller, or throws the right status.
 *
 * Every portal endpoint starts here, so the token, the switch, the credential
 * version and the password are checked in one place and an endpoint cannot be
 * written that skips one.
 */
export async function admitPortal(services: Services, token: string, grant: { password?: string | null; credentialVersion?: number }): Promise<ResolvedPortal> {
  try {
    return await services.portals.resolve({ token, password: grant.password ?? null, credentialVersion: grant.credentialVersion });
  } catch (error) {
    if (error instanceof PortalAccessError) throw new HttpError(portalErrorStatus(error), error.message);
    throw error;
  }
}

/**
 * A refusal's status. A wrong password and a missing one are 401 so the page can
 * ask again; everything else is 404, and deliberately indistinguishable — a
 * token naming another department's portal must look exactly like one naming
 * nothing at all.
 */
export function portalErrorStatus(error: PortalAccessError): number {
  return error.reason === "password" ? 401 : 404;
}

/**
 * Turns an error thrown deeper in a call into its HTTP shape.
 *
 * A submission conflict is a 409: the server refused on purpose, and the
 * message says what to do about it. Left to bubble it became a 500 with a
 * generic body, which reads as a fault in the server rather than an answer.
 */
export function asPortalHttpError(error: unknown): never {
  if (error instanceof PortalAccessError) throw new HttpError(portalErrorStatus(error), error.message);
  if (error instanceof PortalSubmissionError) throw new HttpError(409, error.message);
  throw error;
}
