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

const chips = () => screen.queryByTestId("asset-link-chips");

/**
 * The two links a deliverable carries: something to review while it is being
 * made, and the artwork that was signed off.
 *
 * The closed row has to say which of the two exist — that is the whole reason
 * they are two fields rather than one with a kind flag — and the open row edits
 * them through one box with a switch, so a long row does not grow two.
 */
describe("a deliverable's links, on the closed row", () => {
  it("shows nothing at all when it has neither", () => {
    composer();
    expect(chips()).toBeNull();
  });

  it("shows the preview alone", () => {
    composer({ previewUrl: "https://example.com/proof.pdf" });
    expect(screen.getByTestId("asset-link-chip-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-link-chip-artwork")).not.toBeInTheDocument();
  });

  it("shows the final artwork alone", () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    expect(screen.getByTestId("asset-link-chip-artwork")).toBeInTheDocument();
    expect(screen.queryByTestId("asset-link-chip-preview")).not.toBeInTheDocument();
  });

  it("shows both when both are filled in", () => {
    composer({ previewUrl: "https://example.com/proof.pdf", artworkUrl: "https://example.com/final.ai" });
    expect(screen.getByTestId("asset-link-chip-preview")).toBeInTheDocument();
    expect(screen.getByTestId("asset-link-chip-artwork")).toBeInTheDocument();
  });

  it("opens the thing itself, in a tab of its own", () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    const chip = screen.getByTestId("asset-link-chip-artwork");
    expect(chip).toHaveAttribute("href", "https://example.com/final.ai");
    expect(chip).toHaveAttribute("target", "_blank");
    // rel matters: the opened page must not be handed a reference back.
    expect(chip.getAttribute("rel")).toContain("noopener");
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

  it("opens on the preview by default", async () => {
    composer();
    await open();
    expect(screen.getByTestId("asset-link-switch-preview")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Preview link/)).toBeInTheDocument();
  });

  it("opens on the artwork when that is the only link there is", async () => {
    // A finished deliverable should not open on an empty preview box.
    composer({ artworkUrl: "https://example.com/final.ai" });
    await open();
    expect(screen.getByTestId("asset-link-switch-artwork")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Final artwork link/)).toBeInTheDocument();
  });

  it("writes to the field the switch is on", async () => {
    const onPatch = composer();
    await open();
    await userEvent.click(screen.getByTestId("asset-link-switch-artwork"));
    await userEvent.type(screen.getByLabelText(/Final artwork link/), "https://example.com/final.ai");
    await userEvent.click(screen.getByTestId("asset-update"));

    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ artworkUrl: "https://example.com/final.ai" }));
    // And not into the other one.
    expect(onPatch.mock.calls[0]![1]).not.toHaveProperty("previewUrl");
  });

  it("keeps the link it was not editing", async () => {
    const onPatch = composer({ previewUrl: "https://example.com/proof.pdf" });
    await open();
    await userEvent.click(screen.getByTestId("asset-link-switch-artwork"));
    await userEvent.type(screen.getByLabelText(/Final artwork link/), "https://example.com/final.ai");
    await userEvent.click(screen.getByTestId("asset-update"));

    // The preview was untouched, so it is not in the patch at all.
    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ artworkUrl: "https://example.com/final.ai" }));
    expect(onPatch.mock.calls[0]![1]).not.toHaveProperty("previewUrl");
  });

  it("marks the side that already has a link, so both are visible without toggling", async () => {
    composer({ artworkUrl: "https://example.com/final.ai" });
    await open();
    // The preview side is empty and the artwork side is not.
    expect(screen.getByTestId("asset-link-switch-artwork").querySelector("svg.lucide-check")).not.toBeNull();
  });

  it("clears a link when the box is emptied", async () => {
    const onPatch = composer({ previewUrl: "https://example.com/proof.pdf" });
    await open();
    await userEvent.clear(screen.getByLabelText(/Preview link/));
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", expect.objectContaining({ previewUrl: null }));
  });
});
