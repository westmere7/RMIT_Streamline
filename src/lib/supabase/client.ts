import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/config";

/**
 * Supabase client factory.
 *
 * TODO(supabase): To connect a real project later:
 *   1. Create a Supabase project and run `supabase/migrations/*.sql` then `supabase/policies/*.sql`.
 *   2. Copy `.env.example` to `.env.local` and fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *   3. Finish the repositories in `src/data/supabase/` (they currently throw NotImplemented).
 *   4. Set NEXT_PUBLIC_DATA_PROVIDER=supabase.
 *   5. Swap `LocalAuthProvider` for `SupabaseAuthProvider` in `src/features/auth/auth-provider-factory.ts`
 *      (already wired by config – nothing else in the UI changes).
 *
 * In local mode this module is never invoked, so no network connection is made.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const config = getAppConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or use NEXT_PUBLIC_DATA_PROVIDER=local.",
    );
  }
  cached = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  const config = getAppConfig();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}
