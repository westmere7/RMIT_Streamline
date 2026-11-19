import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Globe } from "lucide-react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkTile } from "@/features/portal/portal-admin";

function tile(overrides: Partial<React.ComponentProps<typeof LinkTile>> = {}) {
  const props: React.ComponentProps<typeof LinkTile> = {
    icon: Globe,
    label: "Portal",
    lead: "Departments see their work.",
    figure: 3,
    figureLabel: "departments",
    aside: "0 of 3 have booked",
    url: "https://example.test/portal/abc",
    href: "/portal/abc",
    testId: "portal-link",
    copyTestId: "portal-copy",
    onCopy: vi.fn(),
    onSettings: vi.fn(),
    settings: [
      { label: "Opens on", value: "Table" },
      { label: "Theme", value: "Light" },
    ],
    open: true,
    toggle: { on: true, pending: false, onChange: vi.fn(), label: "Close the portal", testId: "portal-toggle" },
    ...overrides,
  };
  render(<LinkTile {...props} />);
  return props;
}

describe("the portal's link tiles", () => {
  afterEach(() => vi.restoreAllMocks());

  // The blank space is a real link laid under the tile's contents, which let
  // clicks through (pointer-events) to everything but their own controls. The
  // test DOM does no hit testing, so this checks that arrangement.
  it("lays a new-tab link under the whole tile, with its contents letting clicks through", () => {
    tile();
    const block = screen.getByTestId("portal-link-block");
    const link = screen.getByTestId("portal-link-tile-link");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/portal/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.className).toContain("absolute inset-0");
    expect(link.parentElement).toBe(block);
    const contents = [...block.children].filter((child) => child !== link && !child.classList.contains("sr-only"));
    expect(contents.length).toBeGreaterThan(0);
    for (const child of contents) expect(child.className).toContain("pointer-events-none");
    expect(screen.getByTestId("portal-link-settings-list").className).toContain("pointer-events-none");
  });

  it("lists its settings on the card, and the gear opens them", async () => {
    const props = tile();
    const list = screen.getByTestId("portal-link-settings-list");
    expect(list).toHaveTextContent("Opens on");
    expect(list).toHaveTextContent("Table");
    await userEvent.click(screen.getByRole("button", { name: "Portal settings" }));
    expect(props.onSettings).toHaveBeenCalled();
  });

  it("leaves the switch, settings and copy to themselves", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const props = tile();
    await userEvent.click(screen.getByTestId("portal-copy"));
    await userEvent.click(screen.getByTestId("portal-link-settings"));
    await userEvent.click(screen.getByTestId("portal-toggle"));
    expect(props.onCopy).toHaveBeenCalled();
    expect(props.onSettings).toHaveBeenCalled();
    expect(props.toggle.onChange).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
