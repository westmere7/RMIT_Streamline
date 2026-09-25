import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";
import { MobileTableView } from "@/features/boards/components/mobile/mobile-table-view";
import { UndoBar } from "@/features/undo/undo-bar";
import { useUndoStore } from "@/stores/undo-store";
import { createTestApp, TestBoard } from "../helpers/render-app";

/**
 * The standing offer to undo: made by the actions with a clean inverse, taken
 * with one tap, retired by the next thing done. Editing a value is not one of
 * them. Driven through the phone's
 * card, because its chips are the shortest path from a tap to a write.
 */
const boardId = SEED_BOARD_IDS.rmitinerary;

function Screen() {
  return (
    <TestBoard boardId={boardId}>
      <MobileTableView mode="cards" />
      <UndoBar />
    </TestBoard>
  );
}

/** Opens the first card's status sheet and picks a label other than the current one. */
async function changeFirstStatus(user: ReturnType<typeof userEvent.setup>) {
  const chip = (await screen.findAllByTestId("mobile-card-status"))[0]!;
  const before = chip.textContent ?? "";
  await user.click(chip);
  const options = await screen.findAllByTestId("mobile-label-option");
  const other = options.find((o) => !(o.textContent ?? "").includes(before.trim()))!;
  const picked = other.textContent?.trim() ?? "";
  await user.click(other);
  return { before: before.trim(), picked };
}

describe("undo", () => {
  beforeEach(() => useUndoStore.getState().clear());

  it("does not offer to undo a value edit: the cell is set again instead", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(<Screen />);

    const { picked } = await changeFirstStatus(user);
    await waitFor(() => expect((screen.getAllByTestId("mobile-card-status")[0]!).textContent?.trim()).toBe(picked));
    expect(screen.queryByTestId("undo-bar")).not.toBeInTheDocument();
  }, 20_000);

  it("offers to undo a duplicate, and removes the copy when taken", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(<Screen />);
    const count = (await screen.findAllByTestId("mobile-item-card")).length;

    await user.click(screen.getAllByTestId("mobile-item-menu")[0]!);
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    const bar = await screen.findByTestId("undo-bar");
    expect(bar).toHaveTextContent("Duplicated as");
    await waitFor(() => expect(screen.getAllByTestId("mobile-item-card")).toHaveLength(count + 1));

    await user.click(within(bar).getByTestId("undo-button"));
    await waitFor(() => expect(screen.queryByTestId("undo-bar")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByTestId("mobile-item-card")).toHaveLength(count));
  }, 20_000);

  it("does not offer to undo a delete", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(<Screen />);
    await screen.findAllByTestId("mobile-item-card");

    await user.click(screen.getAllByTestId("mobile-item-menu")[0]!);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete item" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete item" })).not.toBeInTheDocument());
    expect(screen.queryByTestId("undo-bar")).not.toBeInTheDocument();
  }, 20_000);

  it("the store holds one offer, spends it when performed, and forgets it when cleared", async () => {
    const store = useUndoStore.getState();
    let undone = 0;
    store.propose("First", async () => {
      undone += 1;
    });
    store.propose("Second", async () => {
      undone += 10;
    });
    expect(useUndoStore.getState().offer?.label).toBe("Second");
    await useUndoStore.getState().perform();
    expect(undone).toBe(10);
    expect(useUndoStore.getState().offer).toBeNull();
    store.propose("Third", async () => undefined);
    store.clear();
    expect(useUndoStore.getState().offer).toBeNull();
  });
});
