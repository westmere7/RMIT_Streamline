import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(72),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Passwords need at least ${PASSWORD_MIN_LENGTH} characters`).max(72, "Passwords can be at most 72 characters"),
});

/**
 * Changes the signed-in person's own password.
 *
 * The current password is checked first, with a throwaway client that keeps
 * no session, so a tab left signed in cannot be used to lock its owner out.
 * The new one is then set on the account, and every other session the account
 * has is signed out: a password changed because the old one leaked should not
 * leave whoever has it signed in somewhere else. Supabase Auth itself ends
 * every session when a password is set, the caller's included, so the browser
 * signs in again with the new password (SupabaseAuthProvider.changePassword);
 * the explicit sign-out below covers an Auth that does not.
 */
export async function changeOwnPassword(request: Request, input: z.infer<typeof changePasswordSchema>): Promise<{ ok: true }> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to change your password.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user?.email) throw new HttpError(401, "Your session has expired. Sign in again.");
  const { id, email } = data.user;
  if (input.newPassword === input.currentPassword) throw new HttpError(400, "Choose a password different from the one you have.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new HttpError(503, "Sign-in is not configured on this server.");
  const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const checked = await probe.auth.signInWithPassword({ email, password: input.currentPassword });
  if (checked.error || checked.data.user?.id !== id) throw new HttpError(403, "Your current password is not right.");
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);

  const updated = await admin.auth.admin.updateUserById(id, { password: input.newPassword });
  if (updated.error) {
    const message = updated.error.message;
    throw new HttpError(/password/i.test(message) ? 400 : 502, /password/i.test(message) ? message : `The sign-in service could not change the password: ${message}`);
  }
  // Every other device, where Auth has not ended them already. Not fatal: the password has changed either way.
  await admin.auth.admin.signOut(jwt, "others").catch(() => undefined);
  return { ok: true };
}
