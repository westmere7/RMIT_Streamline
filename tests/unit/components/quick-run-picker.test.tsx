import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { AutomationsDialog } from "@/features/automations/automations-dialog";
import { AppReady, createTestApp } from "../helpers/render-app";

/**
 * The quick-run picker, driven the way a person drives it.
 *
 * This exists because of a bug the engine tests could not see: the engine ran a
 * quick run perfectly, and nobody could start one, because in a real browser the
 * ticks in the task list never stuck. The row is now one plain button, which
 * cannot toggle itself twice.
 *
 * An honest limit: happy-dom does not emulate the browser's label activation,
 * so the old markup passes here too. What these tests hold is the contract the
 * fix restored — one click ticks, a second un-ticks, the Run button counts, and
 * the run touches exactly the ticked tasks — and the browser check is the one
 * that proves the markup. Both were done.
 */
describe("the quick-run picker", () => {
  const BOARD = SEED_BOARD_IDS.rmitinerary;

  async function appWithQuickRun() {
    const app = await createTestApp();
    const repos = app.data.services.repos;
    const columns = await repos.boards.listColumns(BOARD);
    const status = columns.find((c) => c.type === "STATUS")!;
    const done = (status.settings as { labels: Array<{ id: string; name: string }> }).labels.find((l) => l.name === "Done")!;
    await app.data.services.automations.create(
      {
        workspaceId: SEED_WORKSPACE_ID,
        boardId: BOARD,
        name: "Mark done",
        enabled: true,
        trigger: { kind: "manual" },
        conditionMatch: "all",
        conditions: [],
        actions: [{ kind: "set_value", columnId: status.id, value: { type: "STATUS", labelId: done.id } }],
        createdBy: SEED_USER_IDS.danh,
      },
      { columns, groups: await repos.boards.listGroups(BOARD), users: await repos.users.list() },
    );
    const board = (await repos.boards.getById(BOARD))!;
    await app.render(
      <AppReady>
        <AutomationsDialog board={board} canManage open onOpenChange={() => undefined} />
      </AppReady>,
    );
    return { app, status, done };
  }

  it("keeps a task ticked when it is clicked, and counts it on the Run button", async () => {
    const user = userEvent.setup();
    await appWithQuickRun();

    await user.click(await screen.findByTestId("automations-tab-quick"));
    await user.click(await screen.findByTestId("quick-run-start"));

    const picker = await screen.findByTestId("quick-run-picker");
    const rows = await within(picker).findAllByTestId("quick-run-task");
    expect(rows.length).toBeGreaterThan(2);

    // Nothing chosen: the button says so and will not go.
    const go = within(picker).getByTestId("quick-run-go");
    expect(go).toBeDisabled();
    expect(picker).toHaveTextContent("Pick at least one task.");

    // One click, one tick. This is the assertion that was failing in the browser.
    await user.click(rows[0]!);
    expect(rows[0]).toHaveAttribute("aria-checked", "true");
    await user.click(rows[1]!);
    expect(rows[1]).toHaveAttribute("aria-checked", "true");
    expect(rows[2]).toHaveAttribute("aria-checked", "false");
    expect(go).toBeEnabled();
    expect(go).toHaveTextContent("Run on 2 tasks");

    // And a second click on the same row un-ticks it, once.
    await user.click(rows[0]!);
    expect(rows[0]).toHaveAttribute("aria-checked", "false");
    expect(go).toHaveTextContent("Run on 1 task");
  });

  it("runs against exactly the ticked tasks and then puts the picker away", async () => {
    const user = userEvent.setup();
    const { app, status, done } = await appWithQuickRun();
    const repos = app.data.services.repos;

    await user.click(await screen.findByTestId("automations-tab-quick"));
    await user.click(await screen.findByTestId("quick-run-start"));
    const picker = await screen.findByTestId("quick-run-picker");
    const rows = await within(picker).findAllByTestId("quick-run-task");
    const chosenName = rows[1]!.textContent ?? "";

    await user.click(rows[1]!);
    await user.click(within(picker).getByTestId("quick-run-go"));

    // The picker closes on success and the row's tally moves.
    await waitFor(() => expect(screen.queryByTestId("quick-run-picker")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("quick-run")).toHaveTextContent(/1 time/));

    // The chosen task is done; its neighbour is not.
    const items = (await repos.items.listByBoard(BOARD)).filter((i) => i.archivedAt === null && i.parentItemId === null);
    const chosen = items.find((i) => chosenName.includes(i.name))!;
    const other = items.find((i) => i.id !== chosen.id)!;
    const value = async (itemId: string) => (await repos.items.listValuesByItem(itemId)).find((v) => v.columnId === status.id)?.value;
    expect(await value(chosen.id)).toEqual({ type: "STATUS", labelId: done.id });
    expect(await value(other.id)).not.toEqual({ type: "STATUS", labelId: done.id });
  });

  it("offers Select all, and never more than the cap", async () => {
    const user = userEvent.setup();
    await appWithQuickRun();

    await user.click(await screen.findByTestId("automations-tab-quick"));
    await user.click(await screen.findByTestId("quick-run-start"));
    const picker = await screen.findByTestId("quick-run-picker");
    await user.click(within(picker).getByRole("button", { name: /Select all/ }));

    const rows = within(picker).getAllByTestId("quick-run-task");
    const ticked = rows.filter((r) => r.getAttribute("aria-checked") === "true").length;
    expect(ticked).toBe(Math.min(rows.length, 50));
    expect(within(picker).getByTestId("quick-run-go")).toHaveTextContent(`Run on ${ticked} tasks`);
  });
});
