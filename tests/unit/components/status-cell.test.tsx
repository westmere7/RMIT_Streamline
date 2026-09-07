import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardColumn, Item } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { StatusCell } from "@/features/boards/components/cells/cell-renderer";

// The chip asks the board's asset lines how far along the work is; the lines
// themselves are the Assets tab's business, so they are stubbed here.
const assets = vi.hoisted(() => ({ progress: null as { lines: number; done: number; percent: number } | null }));
vi.mock("@/features/items/asset-hooks", () => ({
  useItemAssetProgress: () => assets.progress,
  useBoardAssets: () => ({ data: undefined }),
}));

const column: BoardColumn = { id: "status", boardId: "b", name: "Status", type: "STATUS", settings: defaultSettingsFor("STATUS"), position: 0, width: 150, hidden: false, createdAt: "" };
const item: Item = { id: "i1", boardId: "b", groupId: "g", parentItemId: null, name: "Hero film", description: null, position: 0, createdBy: "u", archivedAt: null, createdAt: "", updatedAt: "" };

function renderCell(onChange = vi.fn(), openEditLabels = vi.fn(), readOnly = false, labelId = "working") {
  const ctx = { openEditLabels } as unknown as BoardContextValue;
  render(
    <TooltipPrimitive.Provider>
      <BoardContextProvider value={ctx}>
        <div style={{ height: 36 }}>
          <StatusCell item={item} column={column} value={{ type: "STATUS", labelId }} onChange={onChange} readOnly={readOnly} />
        </div>
      </BoardContextProvider>
    </TooltipPrimitive.Provider>,
  );
  return { onChange, openEditLabels };
}

describe("StatusCell", () => {
  beforeEach(() => {
    assets.progress = null;
  });

  it("shows the current label as a coloured pill", () => {
    renderCell();
    expect(screen.getByRole("gridcell", { name: /Status: Working On It for Hero film/ })).toHaveTextContent("Working On It");
  });

  it("opens a picker and emits the chosen label", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCell();
    await user.click(screen.getByRole("gridcell", { name: /Status: Working On It/ }));
    const done = await screen.findByRole("option", { name: "Done" });
    expect(screen.getByRole("option", { name: "Working On It" })).toHaveAttribute("aria-selected", "true");
    await user.click(done);
    expect(onChange).toHaveBeenCalledWith({ type: "STATUS", labelId: "done" });
  });

  it("can clear the status and open the label editor", async () => {
    const user = userEvent.setup();
    const { onChange, openEditLabels } = renderCell();
    await user.click(screen.getByRole("gridcell", { name: /Status:/ }));
    await user.click(await screen.findByRole("option", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith({ type: "STATUS", labelId: null });
    await user.click(screen.getByRole("gridcell", { name: /Status:/ }));
    await user.click(await screen.findByRole("button", { name: /Edit labels/ }));
    expect(openEditLabels).toHaveBeenCalledWith(column);
  });

  it("stripes a status that means stuck, and only that one", async () => {
    const user = userEvent.setup();
    renderCell(vi.fn(), vi.fn(), false, "stuck");
    expect(screen.getByRole("gridcell", { name: /Status: Stuck/ }).querySelector(".zebra")).not.toBeNull();

    // The picker stripes it too, so the meaning is visible while choosing.
    await user.click(screen.getByRole("gridcell", { name: /Status: Stuck/ }));
    expect(await screen.findByRole("option", { name: "Stuck" })).toHaveClass("zebra");
    expect(screen.getByRole("option", { name: "Done" })).not.toHaveClass("zebra");
  });

  it("draws how far the deliverables have got inside the chip, without taking it over", () => {
    assets.progress = { lines: 4, done: 2, percent: 50 };
    renderCell();
    const bar = screen.getByTestId("status-asset-progress");
    expect(bar).toHaveAttribute("data-percent", "50");
    expect(bar.firstElementChild).toHaveStyle({ width: "50%" });
    // The label still reads first: the bar is decoration with the count in a title.
    expect(bar).toHaveAttribute("aria-hidden");
    expect(bar.parentElement).toHaveAttribute("title", "Working On It — assets 2 of 4 done");
    expect(screen.getByRole("gridcell", { name: /Status: Working On It for Hero film/ })).toHaveTextContent("Working On It");
  });

  it("keeps the bar to work that is under way", () => {
    assets.progress = { lines: 4, done: 4, percent: 100 };
    renderCell(vi.fn(), vi.fn(), false, "done");
    expect(screen.queryByTestId("status-asset-progress")).not.toBeInTheDocument();

    assets.progress = { lines: 4, done: 0, percent: 0 };
    renderCell(vi.fn(), vi.fn(), false, "not_started");
    expect(screen.queryByTestId("status-asset-progress")).not.toBeInTheDocument();
  });

  it("leaves a chip alone when the item has no asset lines", () => {
    renderCell();
    expect(screen.queryByTestId("status-asset-progress")).not.toBeInTheDocument();
  });

  it("is not interactive when read only", () => {
    renderCell(vi.fn(), vi.fn(), true);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("gridcell")).toHaveTextContent("Working On It");
  });
});
