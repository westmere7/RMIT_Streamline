import type { AutomationRunTransport, DrainReport } from "@/services";
import { callApi } from "./api-call";

/**
 * A quick run under Supabase goes through the app's own route
 * (src/app/api/automations/run-now/route.ts, backed by src/server/automations.ts).
 *
 * Not because the browser could not write the cells itself — under the caller's
 * own session, it mostly could — but because a quick run should be the same
 * thing as any other firing: the same engine, the same depth marks so anything
 * it wakes is a chain of one, the same log rows, the same tally on the rule.
 * The queue and the log have no browser-side write policy, on purpose, so the
 * only place all of that can happen is the server. The session travels as a
 * bearer token and the server takes the actor from it.
 */
export class HttpAutomationTransport implements AutomationRunTransport {
  runNow(input: { ruleId: string; itemIds: string[] }): Promise<DrainReport> {
    return callApi<DrainReport>("/api/automations/run-now", { method: "POST", body: JSON.stringify(input) }, { auth: "required" });
  }
}
