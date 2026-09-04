import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { createTestApp, TestBoard } from "../helpers/render-app";

const boardId = SEED_BOARD_IDS.rmitinerary;

async function findItemId(app: Awaited<ReturnType<typeof createTestApp>>, name: string): Promise<string> {
  const items = await app.data.services.repos.items.listByBoard(boardId);
  return items.find((i) => i.name === name)!.id;
}

describe("ItemDetailPanel", () => {
  it("shows the item, its fields and subitems", async () => {
    const app = await createTestApp();
    const itemId = await findItemId(app, "RMITinerary High Achiever");
    await app.render(
      <TestBoard boardId={boardId}>
        <ItemDetailPanel itemId={itemId} onClose={() => undefined} />
      </TestBoard>,
    );
    const panel = screen.getByTestId("item-panel");
    expect(within(panel).getByRole("heading", { name: /RMITinerary High Achiever/ })).toBeInTheDocument();
    expect(within(panel).getByText("Fields")).toBeInTheDocument();
    expect(within(panel).getByRole("gridcell", { name: /Status: Done/ })).toBeInTheDocument();
    expect(within(panel).getByText("Persona illustration")).toBeInTheDocument();
    expect(within(panel).getByText("Final export")).toBeInTheDocument();
  });

  it("posts an update and shows it in the Updates tab", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    const itemId = await findItemId(app, "RMITinerary Explorer");
    await app.render(
      <TestBoard boardId={boardId}>
        <ItemDetailPanel itemId={itemId} onClose={() => undefined} />
      </TestBoard>,
    );
    await user.click(screen.getByRole("tab", { name: /Updates/ }));
    expect(await screen.findByText("No updates yet")).toBeInTheDocument();
    await user.type(screen.getByTestId("comment-input"), "Photography approved, moving to layout.");
    await user.click(screen.getByTestId("comment-submit"));
    expect(await screen.findByText("Photography approved, moving to layout.")).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await app.data.services.repos.comments.listByItem(itemId);
      expect(stored).toHaveLength(1);
    });
    expect(screen.getByRole("tab", { name: /Updates/ })).toHaveTextContent("1");
  });

  it("changes a field from the panel and records activity", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    const itemId = await findItemId(app, "RMITinerary Independent");
    await app.render(
      <TestBoard boardId={boardId}>
        <ItemDetailPanel itemId={itemId} onClose={() => undefined} />
      </TestBoard>,
    );
    const panel = screen.getByTestId("item-panel");
    await user.click(within(panel).getByRole("gridcell", { name: /Status: Not Started/ }));
    await user.click(await screen.findByRole("option", { name: "Working On It" }));
    await waitFor(() => expect(within(panel).getByRole("gridcell", { name: /Status: Working On It/ })).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Activity" }));
    expect(await screen.findByText(/changed/)).toBeInTheDocument();
    expect(screen.getByText("Working On It", { selector: "span" })).toBeInTheDocument();
  });

  it("closes with the Escape key", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    const onClose = vi.fn();
    const itemId = await findItemId(app, "RMITinerary Explorer");
    await app.render(
      <TestBoard boardId={boardId}>
        <ItemDetailPanel itemId={itemId} onClose={onClose} />
      </TestBoard>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
