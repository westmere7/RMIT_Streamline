import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { NamedCount } from "@/features/dashboard/analytics";
import { TreemapChart, treemapLayout } from "@/features/dashboard/charts/treemap";

const rows: NamedCount[] = [
  { name: "Photos", value: 5000, color: "#111111" },
  { name: "Untyped", value: 1500, color: "#222222" },
  { name: "Copies", value: 500, color: "#333333" },
  { name: "Flyers", value: 100, color: "#444444" },
];

/**
 * The map behind the asset mix.
 *
 * Area is the whole claim, so the arithmetic is what these tests are about: a
 * type with half the units gets half the ink, nothing overlaps, and nothing is
 * dropped for being small. The names are deliberately not in the tiles — a
 * name that has to fit inside its own tile vanishes from every small one — so
 * the list beside the map carries them, and hovering ties the two together.
 */
describe("treemapLayout", () => {
  const tiles = treemapLayout(rows.map((r) => ({ key: r.name, value: r.value })));

  it("gives every category a tile, however small", () => {
    expect(tiles.map((t) => t.key).sort()).toEqual(["Copies", "Flyers", "Photos", "Untyped"]);
  });

  it("makes area proportional to value", () => {
    const total = rows.reduce((s, r) => s + r.value, 0);
    for (const tile of tiles) {
      const row = rows.find((r) => r.name === tile.key)!;
      // Percentages of a 100x100 box, so area is the share times 10,000.
      expect(tile.w * tile.h).toBeCloseTo((row.value / total) * 10_000, 4);
    }
  });

  it("fills the box exactly, without spilling out of it", () => {
    expect(tiles.reduce((sum, t) => sum + t.w * t.h, 0)).toBeCloseTo(10_000, 4);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(-0.001);
      expect(tile.y).toBeGreaterThanOrEqual(-0.001);
      expect(tile.x + tile.w).toBeLessThanOrEqual(100.001);
      expect(tile.y + tile.h).toBeLessThanOrEqual(100.001);
    }
  });

  it("keeps tiles near square rather than laying slivers", () => {
    // The naive strip layout gives the 1% category a tile a hundred times
    // longer than it is wide; squarified, nothing is worse than about 8:1.
    for (const tile of tiles) {
      expect(Math.max(tile.w / tile.h, tile.h / tile.w)).toBeLessThan(8);
    }
  });

  it("squarifies against the panel's real shape, not an imagined square one", () => {
    // A 3:1 panel. Laid out as if the box were square, every tile comes out
    // three times wider than it is tall; the ratios below are what the reader
    // actually sees, so the aspect has to reach the algorithm.
    const wide = treemapLayout(
      rows.map((r) => ({ key: r.name, value: r.value })),
      3,
    );
    for (const tile of wide) {
      const onScreen = (tile.w * 3) / tile.h;
      expect(Math.max(onScreen, 1 / onScreen)).toBeLessThan(8);
    }
    expect(wide.reduce((sum, t) => sum + t.w * t.h, 0)).toBeCloseTo(10_000, 4);
  });

  it("has nothing to draw when nothing has units", () => {
    expect(treemapLayout([{ key: "a", value: 0 }])).toEqual([]);
  });
});

describe("the treemap chart", () => {
  it("keeps the names in the list beside the map, not inside the tiles", () => {
    render(<TreemapChart data={rows} />);
    for (const tile of screen.getAllByTestId("treemap-tile")) expect(tile).toHaveTextContent("");
    // Named once each, in the legend.
    expect(screen.getByText("Photos")).toBeInTheDocument();
    expect(screen.getAllByText("Flyers")).toHaveLength(1);
  });

  it("highlights the tile when its name is hovered, and the name when its tile is", async () => {
    const u = userEvent.setup();
    render(<TreemapChart data={rows} />);
    const tile = (key: string) => screen.getAllByTestId("treemap-tile").find((t) => t.dataset.key === key)!;
    const legendRow = (name: string) => within(screen.getByRole("list")).getByText(name);

    await u.hover(legendRow("Copies"));
    expect(tile("Copies")).toHaveAttribute("data-active");
    // Everything else steps back, so the one being asked about is unmistakable.
    expect(tile("Photos").style.opacity).toBe("0.35");

    await u.unhover(legendRow("Copies"));
    await u.hover(tile("Photos"));
    expect(legendRow("Photos").closest("div")).toHaveClass("bg-accent/70");
  });

  it("puts the figures at the cursor rather than inside the tile", async () => {
    const u = userEvent.setup();
    render(<TreemapChart data={rows} totalLabel="units" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await u.hover(screen.getAllByTestId("treemap-tile").find((t) => t.dataset.key === "Untyped")!);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Untyped");
    // The share, because a tile's size is a share and the number should say so.
    expect(tip).toHaveTextContent("1,500");
    expect(tip).toHaveTextContent("21.1% of 7,100");
  });
});
