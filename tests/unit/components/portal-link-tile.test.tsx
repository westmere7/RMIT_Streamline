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
    open: true,
    toggle: { on: true, pending: false, onChange: vi.fn(), label: "Close the portal", testId: "portal-toggle" },
    ...overrides,
  };
  render(<LinkTile {...props} />);
  return props;
}

describe("the portal's link tiles", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens the link in a new tab from the tile's blank space", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    tile();
    await userEvent.click(screen.getByTestId("portal-link-figure"));
    expect(open).toHaveBeenCalledWith("/portal/abc", "_blank", "noopener,noreferrer");
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
