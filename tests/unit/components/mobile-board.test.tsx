import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";
import { MobileTableView } from "@/features/boards/components/mobile/mobile-table-view";
import { createTestApp, TestBoard } from "../helpers/render-app";

const boardId = SEED_BOARD_IDS.rmitinerary;

function MobileTable({ openItem }: { openItem?: (id: string | null) => void }) {
  const [mode, setMode] = React.useState<"cards" | "grid">("cards");
  return (
    <TestBoard boardId={boardId} openItem={openItem}>
      <MobileTableView mode={mode} onModeChange={setMode} />
    </TestBoard>
  );
}

describe("the mobile board", () => {
  it("puts the status and due date on every card, and the priority only when it asks for attention", async () => {
    const app = await createTestApp();
    await app.render(<MobileTable />);

    const cards = await screen.findAllByTestId("mobile-item-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(within(card).getByTestId("mobile-card-status")).toBeInTheDocument();

    // A finished task: what it is and when, and no priority left to act on.
    const done = cards.find((c) => c.textContent?.includes("RMITinerary High Achiever"));
    expect(done).toBeDefined();
    expect(done!).toHaveTextContent("Done");
    expect(done!).toHaveTextContent(/Sep/);
    expect(within(done!).queryByTestId("mobile-card-priority")).toBeNull();
    // Low and medium are the ordinary case: a priority on a card is a high one.
    for (const chip of screen.queryAllByTestId("mobile-card-priority")) expect(chip).toHaveAccessibleName(/: (high|critical|urgent)$/i);
  });

  it("keeps the booking code off the card, a tap away in its menu", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    const items = await app.data.services.repos.items.listByBoard(boardId);
    const coded = items.find((i) => i.ticket && !i.parentItemId);
    await app.render(<MobileTable />);

    const cards = await screen.findAllByTestId("mobile-item-card");
    const card = cards.find((c) => c.textContent?.includes(coded!.name))!;
    expect(card).not.toHaveTextContent(coded!.ticket!);
    await user.click(within(card).getByTestId("mobile-item-menu"));
    expect(await screen.findByRole("menuitem", { name: `Copy ID ${coded!.ticket}` })).toBeInTheDocument();
  });

  it("folds a group and says how many are in it", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(<MobileTable />);

    const groups = await screen.findAllByTestId("mobile-group");
    const design = groups.find((g) => g.textContent?.startsWith("Design"))!;
    const toggle = within(design).getByTestId("mobile-group-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(design).getAllByTestId("mobile-item-card").length).toBeGreaterThan(0);

    await user.click(toggle);
    await waitFor(() => expect(within(design).getByTestId("mobile-group-toggle")).toHaveAttribute("aria-expanded", "false"));
    expect(within(design).queryAllByTestId("mobile-item-card")).toHaveLength(0);
  });

  it("opens an item by tapping the card", async () => {
    const user = userEvent.setup();
    const openItem = vi.fn();
    const app = await createTestApp();
    await app.render(<MobileTable openItem={openItem} />);

    const cards = await screen.findAllByTestId("mobile-item-card");
    await user.click(cards[0]!);
    expect(openItem).toHaveBeenCalledTimes(1);
    expect(openItem.mock.calls[0]![0]).toEqual(expect.any(String));
  });

  it("selects items and offers bulk actions without a drag or a right-click", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(<MobileTable />);

    await user.click(await screen.findByTestId("mobile-select-mode"));
    const cards = await screen.findAllByTestId("mobile-item-card");
    await user.click(cards[0]!);

    const bar = await screen.findByTestId("mobile-bulk-actions");
    expect(bar).toHaveTextContent("item selected");
    expect(within(bar).getByTestId("mobile-bulk-move")).toBeInTheDocument();
  });

  it("gives every primary control a 44px touch target", async () => {
    const app = await createTestApp();
    await app.render(<MobileTable />);
    await screen.findAllByTestId("mobile-item-card");

    // jsdom reports no geometry, so the classes that set the height are the
    // assertion: each of these must carry a min-height of 44px (min-h-11) or more.
    for (const testId of ["mobile-group-toggle", "mobile-add-item"]) {
      const el = screen.getAllByTestId(testId)[0]!;
      expect(el.className).toMatch(/min-h-(11|12|14)\b/);
    }
  });
});
