import { screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { BrowsePage } from "@/features/mobile/browse-page";
import { useUiStore } from "@/stores/ui-store";
import { AppReady, createTestApp } from "../helpers/render-app";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

/**
 * Browse is the sidebar on a phone. The task counts beside boards and teams
 * came to the sidebar and a team's page; they belong here too, under the same
 * switches, and a team with nothing on it is one dashed line as on its page.
 */
describe("Browse on a phone", () => {
  it("counts each board's tasks, and says an empty team in one line", async () => {
    useUiStore.setState({ showBoardCounts: true, showTeamCounts: true });
    const app = await createTestApp();
    await app.render(
      <AppReady>
        <BrowsePage />
      </AppReady>,
    );
    expect((await screen.findAllByTestId("board-item-count")).length).toBeGreaterThan(0);
    expect((await screen.findAllByTestId("team-item-count")).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("browse-empty")[0]).toHaveTextContent("No boards yet");
  });

  it("shows no counts when they are switched off on this device", async () => {
    useUiStore.setState({ showBoardCounts: false, showTeamCounts: false });
    const app = await createTestApp();
    await app.render(
      <AppReady>
        <BrowsePage />
      </AppReady>,
    );
    await screen.findAllByText("Open team");
    expect(screen.queryByTestId("board-item-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-item-count")).not.toBeInTheDocument();
    useUiStore.setState({ showBoardCounts: true, showTeamCounts: true });
  });
});
