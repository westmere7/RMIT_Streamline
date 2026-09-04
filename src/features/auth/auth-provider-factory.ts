import type { AuthProvider } from "@/domain";
import type { Repositories } from "@/data/repositories";
import type { DataProviderKind } from "@/lib/config";
import { LocalAuthProvider } from "./providers/local-auth-provider";
import { SupabaseAuthProvider } from "./providers/supabase-auth-provider";

export function createAuthProvider(kind: DataProviderKind, repositories: Repositories): AuthProvider {
  switch (kind) {
    case "supabase":
      return new SupabaseAuthProvider();
    case "local":
    default:
      return new LocalAuthProvider(repositories.users);
  }
}
