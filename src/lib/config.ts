/**
 * Runtime configuration read from public environment variables.
 * Everything defaults to local mode; missing Supabase variables never throw.
 */
export type DataProviderKind = "local" | "supabase";

export interface AppConfig {
  dataProvider: DataProviderKind;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

function readProvider(): DataProviderKind {
  const raw = process.env.NEXT_PUBLIC_DATA_PROVIDER?.trim().toLowerCase();
  if (raw === "supabase") return "supabase";
  return "local";
}

export function getAppConfig(): AppConfig {
  const dataProvider = readProvider();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

  if (dataProvider === "supabase" && (!supabaseUrl || !supabaseAnonKey)) {
    console.warn(
      "[config] NEXT_PUBLIC_DATA_PROVIDER=supabase but Supabase variables are missing. Falling back to local mode.",
    );
    return { dataProvider: "local", supabaseUrl, supabaseAnonKey };
  }

  return { dataProvider, supabaseUrl, supabaseAnonKey };
}

export const APP_NAME = "Streamline";
export const IS_DEV = process.env.NODE_ENV !== "production";
