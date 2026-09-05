import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/server/http";

/**
 * Server-only Supabase client with the service role.
 *
 * It bypasses row-level security and can manage Auth accounts, so it exists
 * only for the onboarding route handlers (src/server/onboarding.ts) and must
 * never be imported from anything that ships to the browser. The key is read
 * from SUPABASE_SERVICE_ROLE_KEY, which has no NEXT_PUBLIC_ prefix and so is
 * never bundled.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new HttpError(
      503,
      "Onboarding is not configured on this server: set SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) in the deployment's environment variables.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return cached;
}

export function isOnboardingServerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
