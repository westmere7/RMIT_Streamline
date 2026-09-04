import type { Repositories } from "@/data/repositories";
import { createLocalRepositories } from "@/data/local";
import { createSupabaseRepositories } from "@/data/supabase";
import { getAppConfig, type DataProviderKind } from "@/lib/config";

/**
 * Chooses the repository set for the configured provider.
 * The UI never imports Local* or Supabase* classes directly.
 */
export function createRepositories(kind: DataProviderKind = getAppConfig().dataProvider): Repositories {
  switch (kind) {
    case "supabase":
      return createSupabaseRepositories();
    case "local":
    default:
      return createLocalRepositories();
  }
}
