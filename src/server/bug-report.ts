import { z } from "zod";
import type { BugReportInput, BugReportReceipt } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { newId } from "@/lib/ids";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices } from "@/services";
import { bugReportSchema } from "@/services/bug-report-service";
import { HttpError } from "./http";

/**
 * Bug reports for the Supabase provider.
 *
 * The board a report lands on has one member, so the route under
 * src/app/api/bugs runs the ordinary services with the service role, and
 * stores the screenshots itself: the browser sends each as a WebP data URL and
 * gets back a task whose Screenshot columns link to the stored files. Only a
 * signed-in, active member of the workspace may report.
 */

export const BUG_SCREENSHOT_BUCKET = "bug-screenshots";
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export const bugReportBodySchema = z.object({ report: bugReportSchema });

export async function submitBugReport(request: Request, slug: string, raw: BugReportInput): Promise<BugReportReceipt> {
  const { workspaceId, reporterId } = await authorise(request, slug);
  const report = bugReportSchema.parse(raw) as BugReportInput;
  const screenshots: string[] = [];
  for (const shot of report.screenshots) screenshots.push(await storeScreenshot(workspaceId, shot));
  routeRepositoriesThrough(getSupabaseAdminClient());
  const services = createServices(createSupabaseRepositories());
  return services.bugReports.file(workspaceId, { ...report, screenshots }, reporterId);
}

/** A data URL in, a public link out. Anything that is already a link is not ours to have been sent. */
async function storeScreenshot(workspaceId: string, dataUrl: string): Promise<string> {
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Screenshots have to be sent as images.");
  const bytes = Buffer.from(match[1]!, "base64");
  if (bytes.length > MAX_SCREENSHOT_BYTES) throw new HttpError(413, "One of the screenshots is too big. Try a smaller one.");
  const path = `${workspaceId}/${newId()}.webp`;
  const storage = getSupabaseAdminClient().storage.from(BUG_SCREENSHOT_BUCKET);
  const { error } = await storage.upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error) throw new HttpError(500, /bucket/i.test(error.message) ? "The bug-screenshots bucket is missing: run the database migrations or create it in Supabase → Storage." : `The screenshot could not be stored: ${error.message}`);
  return storage.getPublicUrl(path).data.publicUrl;
}

async function authorise(request: Request, slug: string): Promise<{ workspaceId: string; reporterId: string }> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to report a bug.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");

  const found = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (found.error) throw new HttpError(500, `workspaces.bySlug: ${found.error.message}`);
  const workspace = found.data as { id: string } | null;
  if (!workspace) throw new HttpError(404, "That workspace does not exist.");

  const membership = await admin.from("workspace_members").select("status").eq("workspace_id", workspace.id).eq("user_id", data.user.id).maybeSingle();
  if (membership.error) throw new HttpError(500, `workspace_members.lookup: ${membership.error.message}`);
  if ((membership.data as { status: string } | null)?.status !== "ACTIVE") throw new HttpError(403, "Only members of this workspace can report a bug.");
  return { workspaceId: workspace.id, reporterId: data.user.id };
}
