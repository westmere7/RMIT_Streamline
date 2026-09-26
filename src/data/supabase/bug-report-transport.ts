import type { BugReportInput, BugReportReceipt } from "@/domain";
import type { BugReportTransport } from "@/services/bug-report-service";
import { callApi } from "./api-call";

/**
 * Bug reports against Supabase go through src/app/api/bugs/[slug]/route.ts
 * (backed by src/server/bug-report.ts): the board they land on has one member,
 * and the screenshots are stored by the server. The member's session travels
 * as a bearer token.
 */
export class HttpBugReportTransport implements BugReportTransport {
  async submit(input: { workspaceSlug: string; report: BugReportInput }): Promise<BugReportReceipt> {
    return callApi<BugReportReceipt>(`/api/bugs/${encodeURIComponent(input.workspaceSlug)}`, { method: "POST", body: JSON.stringify({ report: input.report }) }, { auth: "required" });
  }
}
