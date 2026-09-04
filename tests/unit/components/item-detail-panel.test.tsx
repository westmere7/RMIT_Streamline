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
    expect(within(panel).getByRole("gridcell", { name: /Status: Done for RMITinerary High Achiever/ })).toBeInTheDocument();
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
    // Paste rather than type: character-by-character typing can drop keystrokes under CPU load.
    await user.click(screen.getByTestId("comment-input"));
    await user.paste("Photography approved, moving to layout.");
    expect(screen.getByTestId("comment-input")).toHaveValue("Photography approved, moving to layout.");
    await user.click(screen.getByTestId("comment-submit"));
    await waitFor(async () => {
      const stored = await app.data.services.repos.comments.listByItem(itemId);
      expect(stored).toHaveLength(1);
    });
    // The optimistic comment is swapped for the persisted record after refetch, so re-query rather than hold a node.
    await waitFor(() => expect(screen.getByText("Photography approved, moving to layout.")).toBeInTheDocument());
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

  it("lists linked items from other boards and opens the link dialog", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    const sem1 = SEED_BOARD_IDS.sem1;
    const items = await app.data.services.repos.items.listByBoard(sem1);
    const itemId = items.find((i) => i.name === "Sem 1 DOOH adaptation")!.id;
    await app.render(
      <TestBoard boardId={sem1}>
        <ItemDetailPanel itemId={itemId} onClose={() => undefined} />
      </TestBoard>,
    );
    const section = screen.getByTestId("linked-items");
    // Seeded mirror on the Vietnam studio's DOOH board, with the columns that flow between them.
    const linked = await within(section).findByTestId("linked-item");
    expect(within(linked).getByRole("link", { name: "Sem 1 DOOH adaptation" })).toBeInTheDocument();
    expect(linked).toHaveTextContent("DOOH Production");
    expect(linked).toHaveTextContent("Syncs name, description, Owner, Status, Priority, Due Date");

    await user.click(within(section).getByTestId("link-item-button"));
    const dialog = await screen.findByTestId("link-item-dialog");
    expect(within(dialog).getByRole("heading", { name: /Link to another item/ })).toBeInTheDocument();
    // Items on the current board are never offered; the already linked mirror is flagged.
    const candidates = await within(dialog).findAllByTestId("link-candidate");
    expect(candidates.some((c) => c.textContent?.includes("Sem 1 campaign storyboard"))).toBe(false);
    expect(candidates.find((c) => c.textContent?.includes("Sem 1 DOOH adaptation"))).toHaveTextContent("Linked");
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
