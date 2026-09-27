import type { EntityId, TagOption } from "@/domain";
import type { ListOptionUsage, SharedListTransport } from "@/services/workspace-list-service";
import { callApi } from "./api-call";

/** Department changes against Supabase go through src/app/api/departments (src/server/departments.ts), which writes every workspace. */
export class HttpSharedListTransport implements SharedListTransport {
  private post<T>(workspaceId: EntityId, body: unknown): Promise<T> {
    return callApi<T>(`/api/departments/${encodeURIComponent(workspaceId)}`, { method: "POST", body: JSON.stringify(body) }, { auth: "required" });
  }

  async saveDepartments(workspaceId: EntityId, options: readonly TagOption[], renames: Record<string, string>): Promise<void> {
    await this.post(workspaceId, { action: "save", options: options.map((o) => ({ name: o.name, color: o.color })), renames });
  }

  async removeDepartment(workspaceId: EntityId, name: string, replaceWith: string | null | undefined): Promise<void> {
    await this.post(workspaceId, { action: "remove", name, replaceWith });
  }

  departmentUsage(workspaceId: EntityId, name: string): Promise<ListOptionUsage> {
    return this.post<ListOptionUsage>(workspaceId, { action: "usage", name });
  }
}
