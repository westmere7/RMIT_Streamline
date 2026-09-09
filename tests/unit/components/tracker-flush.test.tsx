import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerSheet } from "@/domain";
import { useSheetEditor } from "@/features/trackers/hooks";

/**
 * F-004 — a tracker edit made just before leaving must still be saved.
 *
 * `useSheetEditor` debounces its writes by 600 ms. Its unmount cleanup used to
 * call `clearTimeout` and nothing else, under a comment claiming it flushed, so
 * typing into a cell and switching sheet inside that window discarded the edit
 * silently — and `SheetEditorProvider` is mounted with `key={sheet.id}`, so a
 * sheet switch is exactly an unmount.
 *
 * The test drives the real hook and asserts on the service call, not on any
 * internal of the debounce, so a different implementation of the same guarantee
 * still passes.
 */

const saveSheet = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...sheet(), id, ...patch }) as TrackerSheet);

vi.mock("@/features/data/data-context", () => ({
  useServices: () => ({ trackers: { saveSheet } }),
}));

vi.mock("@/lib/sync/broadcast", () => ({ publishDataChange: () => undefined }));
vi.mock("@/features/unsaved/unsaved-work", () => ({ beginUnsavedWork: () => () => undefined }));

function sheet(): TrackerSheet {
  return {
    id: "sheet-1",
    trackerId: "tracker-1",
    name: "Plan",
    position: 0,
    columns: [{ id: "c1", name: "Task", type: "TEXT", width: 200 }],
    rows: [{ id: "r1", type: "DATA", cells: { c1: "before" } }],
    frozenColumns: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as TrackerSheet;
}

type Commit = (updater: (current: TrackerSheet) => TrackerSheet) => void;

/**
 * The hook under test, handing its `commit` out through an effect.
 *
 * A callback rather than an assignment to an outer variable: the React
 * Compiler lint refuses a component that writes to anything outside itself,
 * and it is right to.
 */
function Editor({ onReady }: { onReady: (commit: Commit) => void }) {
  const editor = useSheetEditor(sheet(), true);
  React.useEffect(() => {
    onReady(editor.commit);
  }, [editor.commit, onReady]);
  return null;
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let commit: Commit | null = null;
  const view = render(
    <QueryClientProvider client={client}>
      <Editor onReady={(next) => (commit = next)} />
    </QueryClientProvider>,
  );
  return { view, commit: () => commit! };
}

describe("a tracker edit survives leaving the sheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveSheet.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves when the editor unmounts inside the debounce window", async () => {
    const { view, commit } = renderEditor();

    act(() => {
      commit()((current) => ({ ...current, rows: [{ ...current.rows[0]!, cells: { c1: "after" } }] }) as TrackerSheet);
    });
    // Nothing has been written yet: the debounce is still running.
    expect(saveSheet).not.toHaveBeenCalled();

    // The user clicks another sheet 200 ms later.
    act(() => {
      vi.advanceTimersByTime(200);
      view.unmount();
    });

    expect(saveSheet).toHaveBeenCalledTimes(1);
    const [, patch] = saveSheet.mock.calls[0]!;
    expect((patch.rows as Array<{ cells: Record<string, unknown> }>)[0]!.cells.c1).toBe("after");
  });

  it("still writes only once when the debounce completes normally", async () => {
    const { commit } = renderEditor();
    act(() => {
      commit()((current) => ({ ...current, rows: [{ ...current.rows[0]!, cells: { c1: "typed" } }] }) as TrackerSheet);
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(saveSheet).toHaveBeenCalledTimes(1);
  });

  it("does not write when nothing was edited", () => {
    const { view } = renderEditor();
    act(() => view.unmount());
    expect(saveSheet).not.toHaveBeenCalled();
  });
});
