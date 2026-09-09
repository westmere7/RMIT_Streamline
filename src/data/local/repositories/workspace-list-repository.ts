import type { WorkspaceListKey, WorkspaceListOption, WorkspaceListOptionInput } from "@/domain";
import type { WorkspaceListRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/** The workspace's shared lists, one row per option. */
export class LocalWorkspaceListRepository implements WorkspaceListRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<WorkspaceListOption[]> {
    const db = await this.conn.getDb();
    const rows = await db.getAllFromIndex("workspaceLists", "byWorkspace", workspaceId);
    return rows.sort((a, b) => a.position - b.position);
  }

  async replace(workspaceId: string, listKey: WorkspaceListKey, options: WorkspaceListOptionInput[]): Promise<WorkspaceListOption[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaceLists", "readwrite");
    const store = tx.objectStore("workspaceLists");
    for (const existing of await store.index("byWorkspace").getAll(workspaceId)) {
      if (existing.listKey === listKey) await store.delete(existing.id);
    }
    const now = nowIso();
    const written: WorkspaceListOption[] = options.map((option) => ({
      id: newId(),
      workspaceId,
      listKey,
      name: option.name,
      color: option.color,
      position: option.position,
      createdAt: now,
      updatedAt: now,
    }));
    for (const row of written) await store.put(row);
    await tx.done;
    return written;
  }
}
