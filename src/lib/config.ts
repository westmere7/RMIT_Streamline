/**
 * Runtime configuration read from public environment variables.
 *
 * Supabase is the default: the app runs on Postgres unless something explicitly
 * asks for the browser store (`NEXT_PUBLIC_DATA_PROVIDER=local`, which the test
 * suites do). Missing Supabase variables never throw — the app falls back to
 * local mode with a warning so a fresh clone still starts.
 */
export type DataProviderKind = "local" | "supabase";

export interface AppConfig {
  dataProvider: DataProviderKind;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

function readProvider(): DataProviderKind {
  const raw = process.env.NEXT_PUBLIC_DATA_PROVIDER?.trim().toLowerCase();
  if (raw === "local") return "local";
  return "supabase";
}

export function getAppConfig(): AppConfig {
  const dataProvider = readProvider();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

  if (dataProvider === "supabase" && (!supabaseUrl || !supabaseAnonKey)) {
    console.warn(
      "[config] Supabase is the default provider but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. " +
        "Falling back to the local browser store — set them (see .env.example) or pin NEXT_PUBLIC_DATA_PROVIDER=local.",
    );
    return { dataProvider: "local", supabaseUrl, supabaseAnonKey };
  }

  return { dataProvider, supabaseUrl, supabaseAnonKey };
}

/** Which deployment this is: one of Vercel's environments, or a build made anywhere else. */
export const DEPLOY_ENV = process.env.NEXT_PUBLIC_DEPLOY_ENV?.trim() || "local";

/** The region the Supabase project sits in, when it has been named (NEXT_PUBLIC_SUPABASE_REGION). */
export const BACKEND_REGION = process.env.NEXT_PUBLIC_SUPABASE_REGION?.trim() || null;

/** The Supabase project's reference, taken from its URL: "https://abcd.supabase.co" → "abcd". */
export function supabaseProjectRef(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? (host.split(".")[0] ?? null) : host;
  } catch {
    return null;
  }
}

export const APP_NAME = "Streamline";
export const IS_DEV = process.env.NODE_ENV !== "production";
