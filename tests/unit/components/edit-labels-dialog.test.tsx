import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardColumn, ColumnSettings, StatusColumnSettings } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { EditLabelsDialog } from "@/features/boards/components/pickers/edit-labels-dialog";

const column: BoardColumn = { id: "status", boardId: "b", name: "Status", type: "STATUS", settings: defaultSettingsFor("STATUS"), position: 0, width: 150, hidden: false, createdAt: "" };

function open() {
  const onSave = vi.fn<(columnId: string, settings: ColumnSettings) => void>();
  render(<EditLabelsDialog column={column} open onOpenChange={vi.fn()} onSave={onSave} />);
  return onSave;
}

/** Picks a meaning from one label's row. Radix selects open a listbox. */
async function chooseMeaning(user: ReturnType<typeof userEvent.setup>, label: string, meaning: string) {
  await user.click(screen.getByRole("combobox", { name: `Meaning of ${label}` }));
  await user.click(await within(await screen.findByRole("listbox")).findByRole("option", { name: meaning }));
}

describe("EditLabelsDialog status meanings", () => {
  it("shows the meaning each label already carries", () => {
    open();
    expect(screen.getByRole("combobox", { name: "Meaning of Done" })).toHaveTextContent("Done");
    expect(screen.getByRole("combobox", { name: "Meaning of Stuck" })).toHaveTextContent("Stuck");
    expect(screen.getByRole("combobox", { name: "Meaning of Working On It" })).toHaveTextContent("In progress");
    expect(screen.getByRole("combobox", { name: "Meaning of Waiting" })).toHaveTextContent("No meaning");
  });

  it("moves a meaning rather than duplicating it, and saves one role per label", async () => {
    const user = userEvent.setup();
    const onSave = open();

    // "Waiting" becomes the stuck one; the old Stuck label keeps its own meaning
    // until it is changed, so a label can hold at most the one it was given.
    await chooseMeaning(user, "Waiting", "Stuck");
    await chooseMeaning(user, "Stuck", "No meaning");
    await user.click(screen.getByRole("button", { name: "Save labels" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![1] as StatusColumnSettings;
    expect(saved.stuckLabelIds).toEqual(["waiting"]);
    expect(saved.doneLabelIds).toEqual(["done"]);
    expect(saved.progressLabelIds).toEqual(["working"]);
  });

  it("lets a label carry no meaning at all", async () => {
    const user = userEvent.setup();
    const onSave = open();
    await chooseMeaning(user, "Done", "No meaning");
    await user.click(screen.getByRole("button", { name: "Save labels" }));
    expect((onSave.mock.calls[0]![1] as StatusColumnSettings).doneLabelIds).toEqual([]);
  });
});
