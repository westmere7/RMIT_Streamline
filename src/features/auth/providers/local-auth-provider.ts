import { AuthError, type AuthProvider, type AuthSession, type SignInWithEmailInput, type WorkspaceMember } from "@/domain";
import type { UserRepository, WorkspaceRepository } from "@/data/repositories";

const STORAGE_KEY = "streamline.local-session";

/** Someone added to a workspace who has not opened their invitation link yet. */
export function isPendingOnboarding(memberships: readonly WorkspaceMember[]): boolean {
  return memberships.length > 0 && memberships.every((m) => m.status !== "ACTIVE") && memberships.some((m) => m.status === "INVITED");
}

export const PENDING_SIGN_IN_MESSAGE = "This account has not finished onboarding. Open the invitation link from your workspace admin to set a password first.";

/** What the auth provider needs from the local onboarding store: a password check, when one was set. */
export interface LocalPasswordVerifier {
  /** True/false when a password exists for the account; null when onboarding never stored one. */
  verifyPassword(userId: string, password: string): Promise<boolean | null>;
}

function readStorage(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof parsed.userId !== "string" || typeof parsed.email !== "string") return null;
    return { userId: parsed.userId, email: parsed.email, provider: "local" };
  } catch {
    return null;
  }
}

function writeStorage(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Development-only authentication. Any active, onboarded user can sign in by
 * email; a password is only checked when one is typed and one was set through
 * onboarding. People who are still pending cannot sign in at all, exactly as in
 * Supabase mode where their account has no password yet. The session lives in
 * localStorage.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly kind = "local" as const;
  private listeners = new Set<(session: AuthSession | null) => void>();

  constructor(
    private readonly users: UserRepository,
    private readonly workspaces: WorkspaceRepository | null = null,
    private readonly passwords: LocalPasswordVerifier | null = null,
  ) {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) this.emit(readStorage());
      });
    }
  }

  async getSession(): Promise<AuthSession | null> {
    const session = readStorage();
    if (!session) return null;
    const user = await this.users.getById(session.userId);
    if (!user || user.deactivatedAt || (await this.isPending(user.id))) {
      writeStorage(null);
      return null;
    }
    return session;
  }

  async signIn(input: SignInWithEmailInput): Promise<AuthSession> {
    const user = await this.users.getByEmail(input.email.trim().toLowerCase());
    if (!user) throw new AuthError("No account exists for that email address.");
    if (user.deactivatedAt) throw new AuthError("This account has been deactivated.");
    if (await this.isPending(user.id)) throw new AuthError(PENDING_SIGN_IN_MESSAGE);
    if (input.password && this.passwords) {
      const ok = await this.passwords.verifyPassword(user.id, input.password);
      if (ok === false) throw new AuthError("That password is not right.");
    }
    const session: AuthSession = { userId: user.id, email: user.email, provider: "local" };
    writeStorage(session);
    this.emit(session);
    return session;
  }

  async signOut(): Promise<void> {
    writeStorage(null);
    this.emit(null);
  }

  onSessionChange(listener: (session: AuthSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async isPending(userId: string): Promise<boolean> {
    if (!this.workspaces) return false;
    return isPendingOnboarding(await this.workspaces.listMembershipsForUser(userId));
  }

  private emit(session: AuthSession | null): void {
    for (const listener of this.listeners) listener(session);
  }
}
