import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PanelHelp } from "@/features/dashboard/components/panel-help";
import { DASHBOARD_HELP } from "@/features/dashboard/help";

describe("the ? on each dashboard panel", () => {
  it("says what every panel shows, how it is counted, how to read it and what to do", () => {
    for (const [topic, help] of Object.entries(DASHBOARD_HELP)) {
      for (const part of [help.shows, help.counted, help.read, help.act]) expect(part.length, topic).toBeGreaterThan(40);
    }
  });

  it("opens on a click, named for its panel", async () => {
    render(<PanelHelp topic="sentBack" title="Sent back" />);
    await userEvent.click(screen.getByRole("button", { name: "About Sent back" }));
    expect(await screen.findByText(DASHBOARD_HELP.sentBack.shows)).toBeInTheDocument();
    for (const label of ["How it's counted", "How to read it", "What to do"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(DASHBOARD_HELP.sentBack.act)).toBeInTheDocument();
  });
});
