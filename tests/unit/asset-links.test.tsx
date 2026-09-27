import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssetLink, User } from "@/domain";
import { assetLinkHref, groupAssetBlocks, legacyAssetLinks, normalizeAssetLinks } from "@/domain";
import { AssetComposer, type AssetComposerRow } from "@/features/assets/asset-composer";

const row = (overrides: Partial<AssetComposerRow> = {}): AssetComposerRow => ({
  id: "a1",
  name: "A1 poster",
  assetType: "Print",
  quantity: 6,
  assigneeIds: [],
  dueDate: null,
  notes: "A4, nothing else.",
  links: [],
  blockId: null,
  blockName: null,
  blockLinks: [],
  completedAt: null,
  ...overrides,
});

const preview: AssetLink = { id: "l1", label: "Preview", url: "https://example.com/proof.pdf", icon: "eye" };
const artwork: AssetLink = { id: "l2", label: "Final artwork", url: "https://example.com/final.ai", icon: "file-check" };

const now = "2026-09-27T00:00:00.000Z";
const person = (id: string, name: string): User => ({ id, email: `${id}@rmit.local`, firstName: name, lastName: "", displayName: name, avatarUrl: null, jobTitle: null, department: null, timezone: "Australia/Melbourne", deactivatedAt: null, createdAt: now, updatedAt: now });
const users = [person("u-duc", "Duc"), person("u-tuyet", "Tuyet")];

function composer(rows: AssetComposerRow[] = [row()], props: Partial<React.ComponentProps<typeof AssetComposer>> = {}) {
  const handlers = { onAdd: vi.fn(), onPatch: vi.fn(), onDuplicate: vi.fn(), onRemove: vi.fn(), onAddBlock: vi.fn(), onPatchBlock: vi.fn(), onSaveBlock: vi.fn(), onRemoveBlock: vi.fn() };
  render(<AssetComposer rows={rows} assetTypes={[]} users={users} canEdit {...handlers} {...props} />);
  return handlers;
}

const open = async () => await userEvent.click(screen.getAllByTestId("asset-toggle")[0]!);

describe("a deliverable's links, on the closed row", () => {
  it("puts no link icons on the row", () => {
    composer([row({ links: [preview, artwork] })]);
    expect(screen.queryByTestId("asset-link-chips")).not.toBeInTheDocument();
    expect(screen.getByTestId("asset-line")).not.toHaveTextContent("Preview");
  });

  it("lists every link in the menu, each to open or copy", async () => {
    const user = userEvent.setup();
    composer([row({ links: [preview, artwork] })]);
    await user.click(screen.getByTestId("asset-menu"));
    expect(await screen.findByRole("menuitem", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Final artwork" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy all links" })).toBeInTheDocument();
  });

  it("gives someone who cannot edit the menu only when there are links in it", () => {
    composer([row({ id: "a1", links: [preview] }), row({ id: "a2", name: "Tile", links: [] })], { canEdit: false });
    const [withLinks, without] = screen.getAllByTestId("asset-line");
    expect(within(withLinks!).getByTestId("asset-menu")).toBeInTheDocument();
    expect(within(without!).queryByTestId("asset-menu")).not.toBeInTheDocument();
  });
});

describe("a deliverable's links, in the open row", () => {
  it("adds a preview from the preset and writes it with Update", async () => {
    const { onPatch } = composer();
    await open();
    await userEvent.click(screen.getByTestId("asset-link-add-eye"));
    await userEvent.type(screen.getByTestId("asset-link-url"), "https://example.com/proof.pdf");
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", { links: [expect.objectContaining({ label: "Preview", url: "https://example.com/proof.pdf", icon: "eye" })] });
  });

  it("changes a link's label and icon", async () => {
    const { onPatch } = composer([row({ links: [preview] })]);
    await open();
    await userEvent.clear(screen.getByTestId("asset-link-label"));
    await userEvent.type(screen.getByTestId("asset-link-label"), "Proof v2");
    await userEvent.click(screen.getByTestId("asset-link-icon"));
    await userEvent.click(await screen.findByTestId("asset-link-icon-folder"));
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", { links: [{ ...preview, label: "Proof v2", icon: "folder" }] });
  });

  it("reorders them with the arrows", async () => {
    const { onPatch } = composer([row({ links: [preview, artwork] })]);
    await open();
    await userEvent.click(screen.getAllByTestId("asset-link-down")[0]!);
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", { links: [artwork, preview] });
  });

  it("takes one off with the cross and leaves the rest", async () => {
    const { onPatch } = composer([row({ links: [preview, artwork] })]);
    await open();
    await userEvent.click(screen.getAllByTestId("asset-link-remove")[0]!);
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).toHaveBeenCalledWith("a1", { links: [artwork] });
  });

  it("does not write a link with no address", async () => {
    const { onPatch } = composer();
    await open();
    await userEvent.click(screen.getByTestId("asset-link-add"));
    await userEvent.click(screen.getByTestId("asset-update"));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("is off where the composer turns links off", async () => {
    composer([row()], { fields: { links: false } });
    await open();
    expect(screen.queryByTestId("asset-link-rows")).not.toBeInTheDocument();
  });
});

describe("links as stored", () => {
  it("opens web and mail addresses, and never another scheme", () => {
    expect(assetLinkHref("https://example.com/a")).toBe("https://example.com/a");
    expect(assetLinkHref("drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(assetLinkHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(assetLinkHref("javascript:alert(1)")).toBeNull();
    expect(assetLinkHref("data:text/html,x")).toBeNull();
    expect(assetLinkHref("\\\\server\\share")).toBeNull();
  });

  it("reads what the jsonb holds, dropping what is not a link", () => {
    expect(normalizeAssetLinks([{ id: "x", label: "", url: " https://a.b ", icon: "nope" }, { label: "No url" }, null, "text"])).toEqual([{ id: "x", label: "Link", url: "https://a.b", icon: "link" }]);
    expect(normalizeAssetLinks("not a list")).toEqual([]);
  });

  it("turns the two old columns into the list, preview first", () => {
    expect(legacyAssetLinks("https://p", "https://f").map((l) => [l.label, l.icon])).toEqual([
      ["Preview", "eye"],
      ["Final artwork", "file-check"],
    ]);
    expect(legacyAssetLinks(null, null)).toEqual([]);
  });
});

describe("blocks", () => {
  const block = (id: string, name: string, extra: Partial<AssetComposerRow> = {}) => row({ id, name, blockId: "b1", blockName: "Duc's kit", assigneeIds: ["u-duc"], ...extra });

  it("groups a block where its first line sits, its lines in their own order", () => {
    const entries = groupAssetBlocks([row({ id: "x" }), block("p", "Poster"), row({ id: "y" }), block("t", "Tiles")]);
    expect(entries.map((e) => (e.kind === "line" ? e.line.id : `${e.name}:${e.lines.map((l) => l.id).join(",")}`))).toEqual(["x", "Duc's kit:p,t", "y"]);
  });

  it("shows the block's name, its person once, and each line with its own date", () => {
    composer([block("p", "Poster", { dueDate: "2026-10-01" }), block("t", "Tiles", { dueDate: "2026-10-09" })]);
    const card = screen.getByTestId("asset-block");
    expect(within(card).getByTestId("asset-block-title")).toHaveTextContent("Duc's kit");
    expect(within(card).getByTestId("asset-block-assignee")).toHaveTextContent("Duc");
    expect(within(card).getAllByTestId("asset-line")).toHaveLength(2);
    // The person is the block's, so the lines do not repeat it.
    expect(within(card).queryAllByTestId("asset-meta").every((m) => m.querySelector("[data-slot=avatar]") === null)).toBe(true);
  });

  it("adds a line to the block on that block's person", async () => {
    const { onAdd } = composer([block("p", "Poster")]);
    await userEvent.type(screen.getByTestId("asset-block-add-input"), "Banner{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Banner", { blockId: "b1", blockName: "Duc's kit", assigneeIds: ["u-duc"], blockLinks: [] });
  });

  it("sets up a new block in one go", async () => {
    const { onAddBlock } = composer([]);
    await userEvent.type(screen.getByTestId("asset-add-input"), "Open day");
    await userEvent.click(screen.getByTestId("asset-add-block"));
    const dialog = await screen.findByTestId("asset-block-dialog");
    expect(within(dialog).getByTestId("asset-block-name")).toHaveValue("Open day");
    const names = within(dialog).getAllByTestId("asset-block-line-name");
    await userEvent.type(names[0]!, "Poster");
    await userEvent.type(names[1]!, "Reel");
    await userEvent.click(within(dialog).getByTestId("asset-block-create"));
    expect(onAddBlock).toHaveBeenCalledWith({
      name: "Open day",
      assigneeIds: [],
      links: [],
      lines: [
        { id: null, name: "Poster", assetType: null, quantity: 1, dueDate: null },
        { id: null, name: "Reel", assetType: null, quantity: 1, dueDate: null },
      ],
    });
  });

  it("takes a line out of its block", async () => {
    const user = userEvent.setup();
    const { onPatch } = composer([block("p", "Poster")]);
    await user.click(screen.getByTestId("asset-menu"));
    await user.click(await screen.findByRole("menuitem", { name: "Take out of block" }));
    expect(onPatch).toHaveBeenCalledWith("p", { blockId: null, blockName: null, blockLinks: [] });
  });

  it("moves a line into a block, onto the block's person", async () => {
    const user = userEvent.setup();
    const { onPatch } = composer([row({ id: "solo", name: "Flyer" }), block("p", "Poster")]);
    const solo = screen.getAllByTestId("asset-line").find((el) => el.getAttribute("data-asset-name") === "Flyer")!;
    await user.click(within(solo).getByTestId("asset-menu"));
    // Into the sub-menu from the keyboard: happy-dom does not hover its way in.
    (await screen.findByRole("menuitem", { name: "Move to block" })).focus();
    await user.keyboard("{ArrowRight}");
    const target = await screen.findByRole("menuitem", { name: "Duc's kit" });
    target.focus();
    await user.keyboard("{Enter}");
    expect(onPatch).toHaveBeenCalledWith("solo", { blockId: "b1", blockName: "Duc's kit", assigneeIds: ["u-duc"], blockLinks: [] });
  });

  it("reopens the block in its dialog, filled in, and hands back every change", async () => {
    const { onSaveBlock } = composer([block("p", "Poster", { assetType: "Print", dueDate: "2026-10-01" }), block("t", "Tiles")]);
    await userEvent.click(screen.getByTestId("asset-block-title"));
    const dialog = await screen.findByTestId("asset-block-dialog");
    expect(within(dialog).getByText("Edit block")).toBeInTheDocument();
    expect(within(dialog).getByTestId("asset-block-name")).toHaveValue("Duc's kit");
    const names = within(dialog).getAllByTestId("asset-block-line-name");
    expect(names.map((n) => (n as HTMLInputElement).value)).toEqual(["Poster", "Tiles"]);
    // Take Tiles off, add a Banner and a folder link for the whole block.
    await userEvent.click(within(dialog).getAllByTestId("asset-block-line-remove")[1]!);
    await userEvent.click(within(dialog).getByTestId("asset-block-add-line"));
    await userEvent.type(within(dialog).getAllByTestId("asset-block-line-name")[1]!, "Banner");
    await userEvent.click(within(dialog).getByTestId("asset-link-add"));
    await userEvent.type(within(dialog).getByTestId("asset-link-label"), "Folder");
    await userEvent.type(within(dialog).getByTestId("asset-link-url"), "https://example.com/kit");
    await userEvent.click(within(dialog).getByTestId("asset-block-create"));
    expect(onSaveBlock).toHaveBeenCalledWith("b1", {
      name: "Duc's kit",
      assigneeIds: ["u-duc"],
      links: [expect.objectContaining({ label: "Folder", url: "https://example.com/kit" })],
      lines: [
        { id: "p", name: "Poster", assetType: "Print", quantity: 6, dueDate: "2026-10-01" },
        { id: null, name: "Banner", assetType: null, quantity: 1, dueDate: null },
      ],
    });
  });

  it("lists the block's own links in the block's menu", async () => {
    const user = userEvent.setup();
    const folder: AssetLink = { id: "f", label: "Shared folder", url: "https://example.com/kit", icon: "folder" };
    composer([block("p", "Poster", { blockLinks: [folder] })]);
    await user.click(screen.getByTestId("asset-block-menu"));
    expect(await screen.findByRole("menuitem", { name: "Shared folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit block" })).toBeInTheDocument();
  });

  it("is a plain list where blocks are not offered", () => {
    composer([block("p", "Poster")], { onAddBlock: undefined });
    expect(screen.queryByTestId("asset-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("asset-add-block")).not.toBeInTheDocument();
  });
});

describe("a detailed row, as To-do shows it", () => {
  it("spells out what the line has, and nothing it does not", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-27T09:00:00"));
    try {
      composer([row({ id: "a1", dueDate: "2026-09-30", links: [preview] }), row({ id: "a2", name: "Tile", assetType: null, quantity: null, notes: null })], { detailed: true, addable: false });
      const lines = screen.getAllByTestId("asset-detail-line");
      // The bare line has nothing to spell out, so it gets no line at all.
      expect(lines).toHaveLength(1);
      const text = lines[0]!.textContent ?? "";
      expect(text).toContain("×6");
      expect(text).toContain("Print");
      expect(text).toContain("In 3 days");
      expect(text).toContain("1 link");
      expect(text).toContain("A4, nothing else.");
      expect(screen.queryByTestId("asset-add-input")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
