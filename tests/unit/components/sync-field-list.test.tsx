import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { BoardColumn, ColumnType } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { SyncFieldList } from "@/features/items/sync-field-list";
import type { ColumnMappingReport } from "@/services";

let n = 0;
function col(name: string, type: ColumnType): BoardColumn {
  n += 1;
  return { id: `c${n}`, boardId: "b", name, type, settings: defaultSettingsFor(type), position: n, width: 120, hidden: false, createdAt: "" };
}

const empty: ColumnMappingReport = { mapped: [], unmapped: [], targetOnly: [] };

describe("SyncFieldList", () => {
  it("shows progress in place of the checkbox for a row that is still saving", () => {
    const source = col("Status", "STATUS");
    const target = col("Status", "STATUS");
    const mapping: ColumnMappingReport = { ...empty, mapped: [{ source, target }] };
    const { rerender } = render(<SyncFieldList mapping={mapping} excluded={new Set()} onToggle={vi.fn()} boardName="A" otherBoardName="B" />);
    expect(screen.getByRole("checkbox", { name: "Sync Status" })).toBeInTheDocument();

    rerender(<SyncFieldList mapping={mapping} excluded={new Set()} onToggle={vi.fn()} pending={new Set([source.id])} boardName="A" otherBoardName="B" />);
    expect(screen.queryByRole("checkbox", { name: "Sync Status" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Saving Status" })).toBeInTheDocument();
  });

  it("offers only the columns on the other board that could carry the value", async () => {
    const user = userEvent.setup();
    const tags = col("Tags", "TAGS");
    const onPair = vi.fn();
    const mapping: ColumnMappingReport = { ...empty, unmapped: [tags], targetOnly: [col("Labels", "TAGS"), col("Delivery", "DATE")] };
    render(<SyncFieldList mapping={mapping} excluded={new Set()} onToggle={vi.fn()} onPair={onPair} boardName="A" otherBoardName="B" />);

    await user.click(screen.getByTestId(`pair-${tags.id}`));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Labels")).toBeInTheDocument();
    expect(within(menu).queryByText("Delivery")).not.toBeInTheDocument();

    await user.click(within(menu).getByText("Labels"));
    expect(onPair).toHaveBeenCalledWith(tags.id, mapping.targetOnly[0]!.id);
  });

  it("does not offer pairing where nothing on the other board fits", () => {
    const tags = col("Tags", "TAGS");
    const mapping: ColumnMappingReport = { ...empty, unmapped: [tags], targetOnly: [col("Delivery", "DATE")] };
    render(<SyncFieldList mapping={mapping} excluded={new Set()} onToggle={vi.fn()} onPair={vi.fn()} boardName="A" otherBoardName="B" />);
    expect(screen.queryByTestId(`pair-${tags.id}`)).not.toBeInTheDocument();
  });

  it("undoes a pairing the user made, and only that kind", async () => {
    const user = userEvent.setup();
    const source = col("Tags", "TAGS");
    const target = col("Labels", "TAGS");
    const auto = { source: col("Status", "STATUS"), target: col("Status", "STATUS") };
    const onPair = vi.fn();
    const mapping: ColumnMappingReport = { ...empty, mapped: [{ source, target }, auto] };
    render(<SyncFieldList mapping={mapping} excluded={new Set()} onToggle={vi.fn()} pairs={[[target.id, source.id]]} onPair={onPair} boardName="A" otherBoardName="B" />);

    // The rules made the Status pair; there is nothing of the user's to undo there.
    expect(screen.queryByRole("button", { name: "Unpair Status" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unpair Tags → Labels" }));
    expect(onPair).toHaveBeenCalledWith(source.id, null);
  });
});
