import { waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { BoardColumn, ColumnValue, Item } from "@/domain";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";
import { CELL_SAVE_DELAY_MS, useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { createTestApp } from "../helpers/render-app";

/**
 * Quick changes to one board cell (v0.161): every change is on screen at once,
 * and only the last one in CELL_SAVE_DELAY_MS is saved — none at all when the
 * cell ends where it started.
 */
const boardId = SEED_BOARD_IDS.rmitinerary;

type Probe = { mutations: ReturnType<typeof useBoardMutations>; snapshot: ReturnType<typeof useBoardSnapshot>["data"] };

function Harness({ onReady }: { onReady: (probe: Probe) => void }) {
  const mutations = useBoardMutations(boardId);
  const snapshot = useBoardSnapshot(boardId).data;
  React.useEffect(() => {
    if (snapshot) onReady({ mutations, snapshot });
  }, [mutations, snapshot, onReady]);
  return <div data-testid="app-ready" />;
}

async function setup() {
  const app = await createTestApp();
  let probe: Probe | null = null;
  await app.render(<Harness onReady={(p) => (probe = p)} />);
  await waitFor(() => expect(probe).not.toBeNull());
  const save = vi.spyOn(app.data.services.items, "setValue");
  const { snapshot } = probe!;
  const column = snapshot!.columns.find((c) => c.type === "STATUS" && c.settings.kind === "status") as BoardColumn & { settings: { labels: Array<{ id: string }> } };
  const item = snapshot!.items.find((i) => !i.parentItemId)! as Item;
  const current = snapshot!.values.find((v) => v.itemId === item.id && v.columnId === column.id)?.value as { labelId?: string | null } | undefined;
  const labels = column.settings.labels.map((l) => l.id).filter((id) => id !== current?.labelId);
  return { probe: () => probe!, save, column, item, current, labels };
}

const status = (labelId: string | null): ColumnValue => ({ type: "STATUS", labelId }) as ColumnValue;

describe("a board cell changed quickly", () => {
  it("shows each change at once and saves only the last", async () => {
    const { probe, save, column, item, labels } = await setup();
    void probe().mutations.setValue(item, column, status(labels[0]!));
    void probe().mutations.setValue(item, column, status(labels[1]!));
    await waitFor(() => expect(probe().snapshot!.values.find((v) => v.itemId === item.id && v.columnId === column.id)?.value).toEqual(status(labels[1]!)));
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: CELL_SAVE_DELAY_MS + 2_000 });
    await new Promise((resolve) => setTimeout(resolve, CELL_SAVE_DELAY_MS + 200));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![2]).toEqual(status(labels[1]!));
  });

  it("saves nothing when the cell ends where it started", async () => {
    const { probe, save, column, item, current, labels } = await setup();
    void probe().mutations.setValue(item, column, status(labels[0]!));
    void probe().mutations.setValue(item, column, status(current?.labelId ?? null));
    await new Promise((resolve) => setTimeout(resolve, CELL_SAVE_DELAY_MS + 300));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a cell's changes in order: a slow save finishes before the next one starts", async () => {
    const { probe, save, column, item, labels } = await setup();
    const order: string[] = [];
    let first = true;
    const real = save.getMockImplementation();
    save.mockImplementation(async (...args) => {
      const label = (args[2] as { labelId: string }).labelId;
      order.push(`start ${label}`);
      if (first) {
        first = false;
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
      order.push(`end ${label}`);
      return real ? real(...args) : (undefined as never);
    });
    void probe().mutations.setValue(item, column, status(labels[0]!));
    // After the first save has gone, a second change to the same cell.
    await new Promise((resolve) => setTimeout(resolve, CELL_SAVE_DELAY_MS + 150));
    void probe().mutations.setValue(item, column, status(labels[1]!));
    await waitFor(() => expect(order).toHaveLength(4), { timeout: 4_000 });
    expect(order).toEqual([`start ${labels[0]}`, `end ${labels[0]}`, `start ${labels[1]}`, `end ${labels[1]}`]);
  });
});
