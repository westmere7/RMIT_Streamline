import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PanelHelp } from "@/features/dashboard/components/panel-help";
import { DASHBOARD_HELP } from "@/features/dashboard/help";

describe("the ? on each dashboard panel", () => {
  it("says what every panel shows and what it means for the team", () => {
    for (const [topic, help] of Object.entries(DASHBOARD_HELP)) {
      expect(help.shows.length, topic).toBeGreaterThan(20);
      expect(help.means.length, topic).toBeGreaterThan(20);
    }
  });

  it("opens on a click, named for its panel", async () => {
    render(<PanelHelp topic="sentBack" title="Sent back" />);
    await userEvent.click(screen.getByRole("button", { name: "About Sent back" }));
    expect(await screen.findByText(DASHBOARD_HELP.sentBack.shows)).toBeInTheDocument();
    expect(screen.getByText(DASHBOARD_HELP.sentBack.means)).toBeInTheDocument();
  });
});
