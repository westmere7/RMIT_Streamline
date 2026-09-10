import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AssetComposer, type AssetComposerRow } from "@/features/assets/asset-composer";

const row = (overrides: Partial<AssetComposerRow> = {}): AssetComposerRow => ({
  id: "a1",
  name: "A1 poster",
  assetType: "Print",
  quantity: 6,
  assigneeIds: [],
  dueDate: null,
  notes: "A4, nothing else.",
  previewUrl: null,
  artworkUrl: null,
  completedAt: null,
  ...overrides,
});

function composer(overrides: Partial<AssetComposerRow> = {}, onPatch = vi.fn()) {
  render(<AssetComposer rows={[row(overrides)]} assetTypes={[]} users={[]} canEdit onAdd={vi.fn()} onPatch={onPatch} onDuplicate={vi.fn()} onRemove={vi.fn()} />);
  return onPatch;
}

const chip = (kind: "preview" | "artwork") => screen.getByTestId(`asset-link-chip-${kind}`);
const filled = (kind: "preview" | "artwork") => chip(kind).getAttribute("data-filled") === "true";

/**
 * The two links a deliverable carries: something to review while it is being
 * made, and the artwork that was signed off.
 *
 * The closed row has to say which of the two exist — that is the whole reason
 * they are two fields rather than one with a kind flag — and the open row edits
 * them through one box with a switch, so a long row does not grow two.
 */
describe("a deliverable's links, on the closed row", () => {
  // Both slots are always on the row — a link that turns up only once it exists
  // moves everything beside it — so what is being asserted is which of the two
  // is filled in, not which of the two is there.
  it("shows a pair of empty slots when it has neither", () => {
    composer();
    expect(filled("preview")).toBe(false);
    expect(filled("artwork")).toBe(false);
  });

  it("fills the preview slot alone", () => {
    composer({ previewUrl: "https://example.com/proof.pdf" });
    expect(filled("preview")).toBe(true);
    expect(filled("artwork")).toBe(false);
  });

  it("fills the final artwork slot alone", () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    expect(filled("artwork")).toBe(true);
    expect(filled("preview")).toBe(false);
  });

  it("fills both when both are filled in", () => {
    composer({ previewUrl: "https://example.com/proof.pdf", artworkUrl: "https://example.com/final.ai" });
    expect(filled("preview")).toBe(true);
    expect(filled("artwork")).toBe(true);
  });

  it("an empty slot is nothing to click, and nothing to read out", () => {
    composer();
    expect(chip("preview").tagName).toBe("SPAN");
    expect(chip("preview")).toHaveAttribute("aria-hidden");
  });

  it("opens the thing itself, in a tab of its own", () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    expect(chip("artwork")).toHaveAttribute("href", "https://example.com/final.ai");
    expect(chip("artwork")).toHaveAttribute("target", "_blank");
    // rel matters: the opened page must not be handed a reference back.
    expect(chip("artwork").getAttribute("rel")).toContain("noopener");
  });
});

describe("a deliverable's links, in the open row", () => {
  const open = async () => await userEvent.click(screen.getByTestId("asset-toggle"));

  it("calls the spec field Specs / notes", async () => {
    composer();
    await open();
    expect(screen.getByText("Specs / notes")).toBeInTheDocument();
    expect(screen.queryByText(/^Spec$/)).not.toBeInTheDocument();
  });

  it("gives each link a line of its own", async () => {
    composer();
    await open();
    expect(screen.getByLabelText(/Preview link/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Final artwork link/)).toBeInTheDocument();
  });

  it("writes to the line that was typed in", async () => {
    const onPatch = composer();
    await open();
    await userEvent.type(screen.getByLabelText(/Final artwork link/), "https://example.com/final.ai");
    await userEvent.click(screen.getByTestId("asset-update"));

    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ artworkUrl: "https://example.com/final.ai" }));
    // And not into the other one.
    expect(onPatch.mock.calls[0]![1]).not.toHaveProperty("previewUrl");
  });

  it("keeps the link it was not editing", async () => {
    const onPatch = composer({ previewUrl: "https://example.com/proof.pdf" });
    await open();
    await userEvent.type(screen.getByLabelText(/Final artwork link/), "https://example.com/final.ai");
    await userEvent.click(screen.getByTestId("asset-update"));

    // The preview was untouched, so it is not in the patch at all.
    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ artworkUrl: "https://example.com/final.ai" }));
    expect(onPatch.mock.calls[0]![1]).not.toHaveProperty("previewUrl");
  });

  it("the tick takes the typed link without leaving the box", async () => {
    const onPatch = composer();
    await open();
    await userEvent.type(screen.getByLabelText(/Preview link/), "https://example.com/proof.pdf");
    await userEvent.click(screen.getByTestId("asset-link-commit-preview"));
    // Taken into the draft, and the tick has nothing left to do.
    expect(screen.getByTestId("asset-link-commit-preview")).toBeDisabled();
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ previewUrl: "https://example.com/proof.pdf" }));
  });

  it("the cross puts the stored link back", async () => {
    const onPatch = composer({ previewUrl: "https://example.com/proof.pdf" });
    await open();
    await userEvent.clear(screen.getByLabelText(/Preview link/));
    await userEvent.type(screen.getByLabelText(/Preview link/), "https://example.com/other.pdf");
    await userEvent.click(screen.getByTestId("asset-link-cancel-preview"));
    expect(screen.getByLabelText(/Preview link/)).toHaveValue("https://example.com/proof.pdf");
    // Nothing was changed, so Update has nothing to write.
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("a line with a link opens it, a line without one is quiet", async () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    await open();
    expect(screen.getByTestId("asset-link-open-artwork")).toHaveAttribute("href", "https://example.com/final.ai");
    expect(screen.queryByTestId("asset-link-open-preview")).not.toBeInTheDocument();
  });

  it("clears a link when the box is emptied", async () => {
    const onPatch = composer({ previewUrl: "https://example.com/proof.pdf" });
    await open();
    await userEvent.clear(screen.getByLabelText(/Preview link/));
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ previewUrl: null }));
  });
});
