import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/config";

/**
 * Supabase client factory.
 *
 * To point the app at a project: fill NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY plus SUPABASE_DB_URL in `.env.local`, then run
 * `npm run db:setup` (applies the SQL, seeds the demo data and switches
 * NEXT_PUBLIC_DATA_PROVIDER to "supabase"). Repositories live in
 * `src/data/supabase/`; the auth provider is chosen by the same config value.
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
