import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { createTestApp, TestBoard } from "../helpers/render-app";

const boardId = SEED_BOARD_IDS.rmitinerary;

describe("BoardToolbar", () => {
  beforeEach(() => {
    useBoardUiStore.setState({ boards: {} });
  });

  it("searches items and shows the visible count", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(
      <TestBoard boardId={boardId}>
        <BoardToolbar view="table" onViewChange={() => {}} />
      </TestBoard>,
    );
    expect(screen.getByText(/16 items/)).toBeInTheDocument();
    await user.type(screen.getByTestId("search-input"), "Explorer");
    await waitFor(() => expect(useBoardUiStore.getState().boards[boardId]?.search).toBe("Explorer"));
    // The toolbar reads the model from context; in this harness the model is unfiltered, so
    // assert on the store which drives the real page.
    expect(screen.getByTestId("search-input")).toHaveValue("Explorer");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(useBoardUiStore.getState().boards[boardId]?.search).toBe("");
  });

  it("applies status and person filters with an active indicator", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(
      <TestBoard boardId={boardId}>
        <BoardToolbar view="table" onViewChange={() => {}} />
      </TestBoard>,
    );
    await user.click(screen.getByTestId("filter-button"));
    const panel = await screen.findByTestId("filter-panel");
    await user.click(await screen.findByLabelText("Stuck"));
    expect(useBoardUiStore.getState().boards[boardId]?.filters.statusIds).toEqual(["stuck"]);
    expect(panel).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("filter-button")).toHaveTextContent("1");

    await user.click(screen.getByTestId("person-filter"));
    await user.click(await screen.findByRole("button", { name: "Danh Nguyen" }));
    await waitFor(() => expect(useBoardUiStore.getState().boards[boardId]?.filters.personIds).toHaveLength(1));
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("person-filter")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(useBoardUiStore.getState().boards[boardId]?.filters.statusIds).toEqual([]);
    expect(useBoardUiStore.getState().boards[boardId]?.filters.personIds).toEqual([]);
  });

  it("sets and toggles sort", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(
      <TestBoard boardId={boardId}>
        <BoardToolbar view="table" onViewChange={() => {}} />
      </TestBoard>,
    );
    await user.click(screen.getByTestId("sort-button"));
    await user.click(await screen.findByRole("menuitemradio", { name: "Due date" }));
    expect(useBoardUiStore.getState().boards[boardId]?.sort).toEqual({ field: "dueDate", direction: "asc" });
    await user.click(screen.getByTestId("sort-button"));
    await user.click(await screen.findByRole("menuitem", { name: /Descending/ }));
    expect(useBoardUiStore.getState().boards[boardId]?.sort).toEqual({ field: "dueDate", direction: "desc" });
  });

  it("creates a new item from the New Item popover", async () => {
    const user = userEvent.setup();
    const app = await createTestApp();
    await app.render(
      <TestBoard boardId={boardId}>
        <BoardToolbar view="table" onViewChange={() => {}} />
      </TestBoard>,
    );
    await user.click(screen.getByTestId("new-item-button"));
    await user.type(await screen.findByTestId("new-item-name"), "Back cover artwork");
    await user.click(screen.getByTestId("new-item-submit"));
    await waitFor(async () => {
      const items = await app.data.services.repos.items.listByBoard(boardId);
      expect(items.some((i) => i.name === "Back cover artwork")).toBe(true);
    });
    await waitFor(() => expect(screen.getByText(/17 items/)).toBeInTheDocument());
  });
});
