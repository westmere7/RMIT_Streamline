import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import type { TrackerRow, TrackerSheet } from "@/domain";
import { MobileRowEditor } from "@/features/trackers/mobile-row-editor";

const sheet: TrackerSheet = {
  id: "s1",
  trackerId: "t1",
  name: "Campaign assets",
  position: 0,
  frozenColumns: 1,
  columns: [
    { id: "asset", name: "Asset", type: "text", width: 200 },
    { id: "qty", name: "Quantity", type: "number", width: 100 },
    { id: "channel", name: "Channel", type: "list", width: 140, options: ["Display", "Social", "Print"] },
    { id: "done", name: "Done", type: "checkbox", width: 80 },
  ],
  rows: [{ id: "r1", kind: "data", cells: { asset: "Hero banner", qty: 3, channel: "Display", done: false } }],
  createdAt: "",
  updatedAt: "",
};

const row = sheet.rows[0] as TrackerRow;

/** Captures what the editor commits, the way the grid's own `commit` would. */
function Harness({ onSheet }: { onSheet: (next: TrackerSheet) => void }) {
  const [open, setOpen] = React.useState(true);
  return <MobileRowEditor sheet={sheet} row={row} open={open} onOpenChange={setOpen} commit={(updater) => onSheet(updater(sheet))} />;
}

describe("the tracker row editor", () => {
  it("shows one labelled field per column, seeded from the row", async () => {
    render(<Harness onSheet={() => undefined} />);
    const editor = await screen.findByTestId("mobile-row-editor");
    expect(within(editor).getByLabelText("Asset")).toHaveValue("Hero banner");
    expect(within(editor).getByLabelText("Quantity")).toHaveValue("3");
    expect(within(editor).getByLabelText("Done")).toBeInTheDocument();
    // A list column gets a picker, not a free-text box.
    expect(within(editor).getByLabelText("Channel")).toBeInTheDocument();
  });

  it("writes the edit through the tracker's own coercion", async () => {
    const user = userEvent.setup();
    let committed: TrackerSheet | null = null;
    render(<Harness onSheet={(next) => (committed = next)} />);

    const editor = await screen.findByTestId("mobile-row-editor");
    await user.clear(within(editor).getByLabelText("Quantity"));
    await user.type(within(editor).getByLabelText("Quantity"), "12");
    await user.click(screen.getByTestId("mobile-row-save"));

    await waitFor(() => expect(committed).not.toBeNull());
    // Coerced to a number by TrackerService, not stored as the string "12".
    expect(committed!.rows[0]!.cells.qty).toBe(12);
    // Untouched columns are left exactly as they were.
    expect(committed!.rows[0]!.cells.asset).toBe("Hero banner");
  });

  it("commits nothing when no field changed", async () => {
    const user = userEvent.setup();
    let commits = 0;
    render(<Harness onSheet={() => (commits += 1)} />);
    await screen.findByTestId("mobile-row-editor");
    await user.click(screen.getByTestId("mobile-row-save"));
    expect(commits).toBe(0);
  });
});
