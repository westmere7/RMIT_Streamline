import type { EntityId } from "@/domain/common/types";

export interface AuthSession {
  userId: EntityId;
  email: string;
  /** Provider that produced this session. */
  provider: "local" | "supabase";
}

export interface SignInWithEmailInput {
  email: string;
  password?: string;
}

/**
 * Abstraction over authentication so that the UI never talks to a specific
 * provider. `LocalAuthProvider` is used in local mode; `SupabaseAuthProvider`
 * will wrap Supabase Auth once a project is connected.
 */
export interface AuthProvider {
  readonly kind: "local" | "supabase";
  getSession(): Promise<AuthSession | null>;
  signIn(input: SignInWithEmailInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Subscribe to session changes. Returns an unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
