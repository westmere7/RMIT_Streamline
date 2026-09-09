import { AuthError, type AuthProvider, type AuthSession, type SignInWithEmailInput } from "@/domain";
import { describeSignInError } from "@/lib/auth/auth-messages";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Supabase Auth adapter.
 *
 * Profiles are created by the `handle_new_user` trigger in
 * supabase/migrations/0001_initial_schema.sql.
 *
 * **Deactivation is checked here, not only by Auth.** Deactivating somebody
 * (Members → Deactivate) writes `users.deactivated_at` and sets their
 * membership to DEACTIVATED; it does not disable the Supabase Auth account,
 * because the account may belong to more than one workspace. Without the check
 * below, a deactivated person could still sign in — the dialog that deactivates
 * them promises they cannot — and their session would then reach every board
 * they own. The local provider has always checked this; this provider did not,
 * so the guarantee held in the demo and not in production. See audit F-001.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly kind = "supabase" as const;

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw new AuthError(error.message);
    const session = data.session;
    if (!session?.user.email) return null;
    // A session that was valid when it was issued and belongs to somebody since
    // deactivated: ended here rather than carried until the token expires.
    if (await isDeactivated(session.user.id)) {
      await getSupabaseClient().auth.signOut();
      return null;
    }
    return { userId: session.user.id, email: session.user.email, provider: "supabase" };
  }

  async signIn(input: SignInWithEmailInput): Promise<AuthSession> {
    if (!input.password) throw new AuthError("Password is required.");
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.session?.user.email) throw new AuthError(describeSignInError(error?.message ?? "Sign in failed."));
    if (await isDeactivated(data.session.user.id)) {
      await getSupabaseClient().auth.signOut();
      throw new AuthError("This account has been deactivated.");
    }
    return { userId: data.session.user.id, email: data.session.user.email, provider: "supabase" };
  }

  async signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new AuthError(error.message);
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      listener(
        session?.user.email ? { userId: session.user.id, email: session.user.email, provider: "supabase" } : null,
      );
    });
    return () => data.subscription.unsubscribe();
  }
}

/**
 * Whether this profile has been deactivated.
 *
 * Read with the caller's own session, so it is subject to the same RLS as
 * everything else — a profile the reader cannot see answers `false`, and they
 * are then refused by the ordinary membership checks instead. A failed read is
 * *not* treated as deactivated: a network blip must not lock people out.
 */
async function isDeactivated(userId: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseClient().from("users").select("deactivated_at").eq("id", userId).maybeSingle();
    if (error) return false;
    return !!data?.deactivated_at;
  } catch {
    return false;
  }
}
