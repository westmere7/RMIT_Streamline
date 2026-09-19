import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeMobile } from "@/features/mobile/home-mobile";
import { MyWorkPage } from "@/features/my-work/my-work-page";
import { InboxPage } from "@/features/notifications/inbox-page";
import { AppReady, createTestApp } from "../helpers/render-app";

/** A read that never comes back, so the page stays in the state being asserted. */
const never = () => new Promise<never>(() => {});

/**
 * What these pages say before their first read comes back.
 *
 * Every figure on them is derived from a list, and an empty list is a
 * perfectly good number — so a page written the obvious way opens on "0 open
 * items" and "You are all caught up", holds them for as long as the network
 * takes, and then replaces them with the truth. Those are not placeholders.
 * They are answers, they are wrong, and people act on them: the whole point of
 * a tally that says nothing is due today is that you can stop reading.
 *
 * So each of these asserts two things — the placeholder is there, and the
 * figure is not.
 */
describe("what a page says before its data arrives", () => {
  it("My Work stands up its sections rather than claiming nothing is assigned", async () => {
    const app = await createTestApp();
    app.data.services.myWork.listAssigned = never;

    await app.render(
      <AppReady>
        <MyWorkPage />
      </AppReady>,
    );

    expect(screen.getByTestId("my-work-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/open items? assigned to you/)).not.toBeInTheDocument();
  });

  it("the inbox does not say you are caught up before it has been read", async () => {
    const app = await createTestApp();
    app.data.services.repos.notifications.listByUser = never;

    await app.render(
      <AppReady>
        <InboxPage />
      </AppReady>,
    );

    expect(screen.getByTestId("inbox-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("You are all caught up.")).not.toBeInTheDocument();
  });

  it("Home leaves the three tallies blank rather than reading them as nought", async () => {
    const app = await createTestApp();
    app.data.services.myWork.listAssigned = never;

    await app.render(
      <AppReady>
        <HomeMobile />
      </AppReady>,
    );

    const tallies = screen.getAllByTestId("home-tally");
    expect(tallies).toHaveLength(3);
    // Labels, and not a digit between them.
    for (const tally of tallies) expect(tally.textContent ?? "").not.toMatch(/\d/);
    expect(screen.getByTestId("my-work-mobile-skeleton")).toBeInTheDocument();
  });
});
