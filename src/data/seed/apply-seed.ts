import type { StreamlineDatabase } from "@/data/local/database";
import { buildSeed } from "./seed-data";

/** Writes the seed bundle into an (empty) database in a single transaction. */
export async function seedDatabase(db: StreamlineDatabase, now: Date = new Date()): Promise<void> {
  const seed = buildSeed(now);
  const tx = db.transaction(
    [
      "users",
      "workspaces",
      "workspaceMembers",
      "teams",
      "teamMembers",
      "boards",
      "boardMembers",
      "boardFavourites",
      "boardGroups",
      "boardColumns",
      "items",
      "itemColumnValues",
      "comments",
      "activities",
      "notifications",
      "boardVisits",
      "meta",
    ],
    "readwrite",
  );

  await Promise.all([
    ...seed.users.map((r) => tx.objectStore("users").put(r)),
    ...seed.workspaces.map((r) => tx.objectStore("workspaces").put(r)),
    ...seed.workspaceMembers.map((r) => tx.objectStore("workspaceMembers").put(r)),
    ...seed.teams.map((r) => tx.objectStore("teams").put(r)),
    ...seed.teamMembers.map((r) => tx.objectStore("teamMembers").put(r)),
    ...seed.boards.map((r) => tx.objectStore("boards").put(r)),
    ...seed.boardMembers.map((r) => tx.objectStore("boardMembers").put(r)),
    ...seed.boardFavourites.map((r) => tx.objectStore("boardFavourites").put(r)),
    ...seed.boardGroups.map((r) => tx.objectStore("boardGroups").put(r)),
    ...seed.boardColumns.map((r) => tx.objectStore("boardColumns").put(r)),
    ...seed.items.map((r) => tx.objectStore("items").put(r)),
    ...seed.itemColumnValues.map((r) => tx.objectStore("itemColumnValues").put(r)),
    ...seed.comments.map((r) => tx.objectStore("comments").put(r)),
    ...seed.activities.map((r) => tx.objectStore("activities").put(r)),
    ...seed.notifications.map((r) => tx.objectStore("notifications").put(r)),
    ...seed.boardVisits.map((r) => tx.objectStore("boardVisits").put(r)),
    tx.objectStore("meta").put({ key: "seededAt", value: now.toISOString() }),
  ]);
  await tx.done;
}
