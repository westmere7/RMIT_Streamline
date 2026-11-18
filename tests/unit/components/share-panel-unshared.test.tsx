import { fireEvent, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { BoardSharePanel } from "@/features/boards/components/dialogs/share-board-dialog";
import { AppReady, createTestApp } from "../helpers/render-app";

/**
 * The share panel is the same with or without a link. Before there is one the
 * address is empty and the switch is off; turning it on creates the link in
 * place, and a choice made first creates it switched off.
 */
describe("Share panel before a link exists", () => {
  it("shows the same controls, and turning the link on creates it", async () => {
    const app = await createTestApp();
    const board = (await app.data.services.boards.listBoards(SEED_WORKSPACE_ID))[0];
    await app.render(
      <AppReady>
        <BoardSharePanel board={board} />
      </AppReady>,
    );
    const link = (await screen.findByTestId("share-link")) as HTMLInputElement;
    expect(link.value).toBe("");
    expect(screen.getByTestId("share-stop")).toBeDisabled();
    expect(screen.getByTestId("share-copy")).toBeDisabled();

    fireEvent.click(screen.getByTestId("share-enabled"));
    await waitFor(() => expect(link.value).toMatch(/\/share\/[a-z0-9]{16,}$/));
    expect(screen.getByTestId("share-enabled")).toHaveAttribute("aria-checked", "true");
    expect((await app.data.services.shares.get(board.id))?.enabled).toBe(true);
  });

  it("creates the link switched off when another choice comes first", async () => {
    const app = await createTestApp();
    const board = (await app.data.services.boards.listBoards(SEED_WORKSPACE_ID))[0];
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
