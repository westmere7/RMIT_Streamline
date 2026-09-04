import { AuthError, type AuthProvider, type AuthSession, type SignInWithEmailInput } from "@/domain";
import type { UserRepository } from "@/data/repositories";

const STORAGE_KEY = "streamline.local-session";

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
 * Development-only authentication. Any seeded, active user can sign in by
 * email with no password. The session lives in localStorage.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly kind = "local" as const;
  private listeners = new Set<(session: AuthSession | null) => void>();

  constructor(private readonly users: UserRepository) {
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
    if (!user || user.deactivatedAt) {
      writeStorage(null);
      return null;
    }
    return session;
  }

  async signIn(input: SignInWithEmailInput): Promise<AuthSession> {
    const user = await this.users.getByEmail(input.email.trim().toLowerCase());
    if (!user) throw new AuthError("No account exists for that email address.");
    if (user.deactivatedAt) throw new AuthError("This account has been deactivated.");
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

  private emit(session: AuthSession | null): void {
    for (const listener of this.listeners) listener(session);
  }
}
