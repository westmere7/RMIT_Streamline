import { handleRoute, json, readJson } from "@/server/http";
import { bugReportBodySchema, submitBugReport } from "@/server/bug-report";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** Files a bug report onto the workspace's App development board. Members only, by their session. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  const body = bugReportBodySchema.parse(await readJson(request));
  return json(await submitBugReport(request, decodeURIComponent(slug), body.report), 201);
});
