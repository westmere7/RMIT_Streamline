import { AuthError, type AuthProvider, type AuthSession, type SignInWithEmailInput } from "@/domain";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Supabase Auth adapter.
 *
 * TODO(supabase): This provider is complete enough to sign in with email +
 * password once a project is connected, but it is not selected until
 * NEXT_PUBLIC_DATA_PROVIDER=supabase. Profiles are created by the
 * `handle_new_user` trigger in supabase/migrations/0001_initial_schema.sql.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly kind = "supabase" as const;

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw new AuthError(error.message);
    const session = data.session;
    if (!session?.user.email) return null;
    return { userId: session.user.id, email: session.user.email, provider: "supabase" };
  }

  async signIn(input: SignInWithEmailInput): Promise<AuthSession> {
    if (!input.password) throw new AuthError("Password is required.");
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.session?.user.email) throw new AuthError(error?.message ?? "Sign in failed.");
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
