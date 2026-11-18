import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { DeliverableNotification } from "@/data/repositories";
import { useOtherWorkspacesUnread } from "@/features/notifications/hooks";
import { AppReady, createTestApp } from "../helpers/render-app";

const DANH = SEED_USER_IDS.danh;
const OTHER = "other-workspace";

function Count() {
  const unreadIn = useOtherWorkspacesUnread(DANH, SEED_WORKSPACE_ID);
  return (
    <AppReady>
      <span data-testid="count">{unreadIn(OTHER)}</span>
    </AppReady>
  );
}

describe("the workspace menu's unread count", () => {
  it("counts only Notifications another workspace's inbox would show", async () => {
    const app = await createTestApp("danh");
    const repos = app.data.services.repos;
    const board = SEED_BOARD_IDS.rmitinerary;
    const [item] = (await repos.items.listByBoard(board)).filter((i) => i.archivedAt === null);
    const base: Omit<DeliverableNotification, "title" | "entityId" | "delivery"> = { userId: DANH, type: "ASSIGNED", body: null, entityType: "ITEM", boardId: board, workspaceId: OTHER, actorId: null };
    await repos.notifications.create({ ...base, title: "Live task", entityId: item!.id, delivery: "NOTIFICATION" });
    // The task this one was about has been deleted: its inbox shows nothing, so the menu must not either.
    await repos.notifications.create({ ...base, title: "Deleted task", entityId: "gone-item", delivery: "NOTIFICATION" });
    // Updates are the quiet kind and never counted.
    await repos.notifications.create({ ...base, title: "Quiet", entityId: item!.id, delivery: "UPDATE" });
    // This workspace's own are its inbox's business, not the menu's.
    await repos.notifications.create({ ...base, title: "Here", entityId: item!.id, delivery: "NOTIFICATION", workspaceId: SEED_WORKSPACE_ID });

    await app.render(<Count />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
  });
});
