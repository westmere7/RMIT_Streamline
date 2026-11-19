import { fireEvent, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { BoardSharePanel } from "@/features/boards/components/dialogs/share-board-dialog";
import { AppReady, createTestApp } from "../helpers/render-app";

/**
 * The share panel is the same with or without a link. Before there is one
 * there is no address to show, so the switch leads; turning it on creates the
 * link in place and shows its address, which stays while the link is off. A
 * choice made first creates it switched off.
 */
describe("Share panel before a link exists", () => {
  it("shows the switch and no address, and turning the link on creates it", async () => {
    const app = await createTestApp();
    const board = (await app.data.services.boards.listBoards(SEED_WORKSPACE_ID))[0]!;
    await app.render(
      <AppReady>
        <BoardSharePanel board={board} />
      </AppReady>,
    );
    const toggle = await screen.findByTestId("share-enabled");
    expect(screen.queryByTestId("share-link")).toBeNull();
    expect(screen.queryByTestId("share-copy")).toBeNull();
    expect(screen.getByTestId("share-stop")).toBeDisabled();

    fireEvent.click(toggle);
    const link = (await screen.findByTestId("share-link")) as HTMLInputElement;
    expect(link.value).toMatch(/\/share\/[a-z0-9]{16,}$/);
    expect(screen.getByTestId("share-enabled")).toHaveAttribute("aria-checked", "true");
    expect((await app.data.services.shares.get(board.id))?.enabled).toBe(true);

    // Off is not gone: the link keeps its address, and the label says it is off.
    const address = link.value;
    fireEvent.click(screen.getByTestId("share-enabled"));
    await waitFor(() => expect(screen.getByText("Link is off")).toBeTruthy());
    expect((screen.getByTestId("share-link") as HTMLInputElement).value).toBe(address);
    expect((await app.data.services.shares.get(board.id))?.enabled).toBe(false);
  });

  it("creates the link switched off when another choice comes first", async () => {
    const app = await createTestApp();
    const board = (await app.data.services.boards.listBoards(SEED_WORKSPACE_ID))[0]!;
    await app.render(
      <AppReady>
        <BoardSharePanel board={board} />
      </AppReady>,
    );
    fireEvent.click(await screen.findByTestId("share-access-public"));
    await waitFor(async () => expect(await app.data.services.shares.get(board.id)).not.toBeNull());
    const share = await app.data.services.shares.get(board.id);
    expect(share?.enabled).toBe(false);
    expect(share?.access).toBe("PUBLIC");
  });
});
