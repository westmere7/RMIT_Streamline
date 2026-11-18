import { getAppConfig } from "@/lib/config";
import { getSupabaseAdminClient, isOnboardingServerConfigured } from "@/lib/supabase/admin";

/** What a link preview says about the app when it says nothing about one workspace. */
export const APP_LINK_TITLE = "Streamline";
export const APP_LINK_DESCRIPTION = "From brief to report, in one place.";

type LinkMeta = { name: string; description: string | null };

/**
 * How long an answer is reused. A workspace's name and description rarely
 * change, and a renamed workspace showing its old name in a link preview for a
 * few minutes harms nobody.
 */
const REMEMBER_MS = 5 * 60_000;
/** Workspaces are few; this only stops made-up slugs piling up. */
const REMEMBER_AT_MOST = 200;
const remembered = new Map<string, { at: number; meta: Promise<LinkMeta | null> }>();

/**
 * The two things a link to a workspace may say about it, for the chat that
 * unfurls the link: its name and its one-line description. The chat's server
 * is not signed in, so this reads with the service role and returns those two
 * fields and nothing else. Null where there is no such workspace, where the
 * app runs on the browser store, or where the lookup fails: the preview then
 * falls back to the app's own line rather than breaking the page.
 *
 * Remembered per server instance for a few minutes. The workspace layout's
 * generateMetadata asks on every server render of every workspace route, and
 * the browser prefetches each link in view, so one page opening asked the
 * database the same question a dozen times in a second; that was most of the
 * project's API log on the first day the team used the app. Lookups made at
 * the same moment share one read, and a failed read is not kept.
 */
export function workspaceLinkMeta(slug: string): Promise<LinkMeta | null> {
  if (getAppConfig().dataProvider !== "supabase" || !isOnboardingServerConfigured()) return Promise.resolve(null);
  const now = Date.now();
  const kept = remembered.get(slug);
  if (kept && now - kept.at < REMEMBER_MS) return kept.meta;

  const meta = readLinkMeta(slug).then((result) => {
    if (result === "failed") {
      remembered.delete(slug);
      return null;
    }
    return result;
  });
  if (remembered.size >= REMEMBER_AT_MOST) remembered.delete(remembered.keys().next().value as string);
  remembered.set(slug, { at: now, meta });
  return meta;
}

async function readLinkMeta(slug: string): Promise<LinkMeta | null | "failed"> {
  try {
    const { data, error } = await getSupabaseAdminClient().from("workspaces").select("name, description").eq("slug", slug).maybeSingle();
    if (error) return "failed";
    if (!data) return null;
    const row = data as { name: string; description: string | null };
    return { name: row.name, description: row.description?.trim() || null };
  } catch {
    return "failed";
  }
}
