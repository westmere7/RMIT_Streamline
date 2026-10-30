import { getAppConfig } from "@/lib/config";
import { getSupabaseAdminClient, isOnboardingServerConfigured } from "@/lib/supabase/admin";

/** What a link preview says about the app when it says nothing about one workspace. */
export const APP_LINK_TITLE = "Streamline";
export const APP_LINK_DESCRIPTION = "From brief to report, in one place.";

/**
 * The two things a link to a workspace may say about it, for the chat that
 * unfurls the link: its name and its one-line description. The chat's server
 * is not signed in, so this reads with the service role and returns those two
 * fields and nothing else. Null where there is no such workspace, where the
 * app runs on the browser store, or where the lookup fails: the preview then
 * falls back to the app's own line rather than breaking the page.
 */
export async function workspaceLinkMeta(slug: string): Promise<{ name: string; description: string | null } | null> {
  if (getAppConfig().dataProvider !== "supabase" || !isOnboardingServerConfigured()) return null;
  try {
    const { data, error } = await getSupabaseAdminClient().from("workspaces").select("name, description").eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    const row = data as { name: string; description: string | null };
    return { name: row.name, description: row.description?.trim() || null };
  } catch {
    return null;
  }
}
