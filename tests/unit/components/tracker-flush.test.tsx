import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackerSheet } from "@/domain";
import { useSheetEditor } from "@/features/trackers/hooks";

/**
 * F-004 — a tracker edit made just before leaving must still be saved.
 *
 * `useSheetEditor` debounces its writes (600 ms then, 2 s since v0.160). Its unmount cleanup used to
 * call `clearTimeout` and nothing else, under a comment claiming it flushed, so
 * typing into a cell and switching sheet inside that window discarded the edit
 * silently — and `SheetEditorProvider` is mounted with `key={sheet.id}`, so a
 * sheet switch is exactly an unmount.
 *
 * The test drives the real hook and asserts on the service call, not on any
 * internal of the debounce, so a different implementation of the same guarantee
 * still passes.
 */

const saveSheet = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ sheet: { ...sheet(), id, ...patch, updatedAt: "2026-01-01T00:00:01.000Z" } as TrackerSheet, sync: null }));

vi.mock("@/features/data/data-context", () => ({
  useServices: () => ({ trackers: { saveSheetDraft: saveSheet } }),
}));

vi.mock("@/features/auth/auth-context", () => ({ useCurrentUser: () => ({ id: "user-1" }) }));

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
      vi.advanceTimersByTime(2_100);
    });
    expect(saveSheet).toHaveBeenCalledTimes(1);
  });

  it("does not write when nothing was edited", () => {
    const { view } = renderEditor();
    act(() => view.unmount());
    expect(saveSheet).not.toHaveBeenCalled();
  });
});

/** A sheet editor whose server version the test changes, as realtime would. */
function Live({ source, onReady, onDraft }: { source: TrackerSheet; onReady: (commit: Commit) => void; onDraft: (draft: TrackerSheet | undefined) => void }) {
  const editor = useSheetEditor(source, true);
  React.useEffect(() => {
    onReady(editor.commit);
  }, [editor.commit, onReady]);
  React.useEffect(() => {
    onDraft(editor.sheet);
  }, [editor.sheet, onDraft]);
  return null;
}

/**
 * v0.160: saves wait for editing to pause, and a version from elsewhere is not
 * put on screen while there are unsaved edits (the next save merges it), so
 * cells deleted in quick succession stay deleted.
 */
describe("saving a sheet in batches", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveSheet.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const typed = (value: string) => (current: TrackerSheet) => ({ ...current, rows: [{ ...current.rows[0]!, cells: { c1: value } }] }) as TrackerSheet;

  it("saves once for a burst of edits, and at least every ten seconds in a long run", async () => {
    const { commit } = renderEditor();
    for (let i = 0; i < 5; i++) {
      act(() => commit()(typed(`v${i}`)));
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
    }
    expect(saveSheet).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });
    expect(saveSheet).toHaveBeenCalledTimes(1);

    saveSheet.mockClear();
    // An edit every second for twelve seconds never pauses long enough, but still saves.
    for (let i = 0; i < 12; i++) {
      act(() => commit()(typed(`w${i}`)));
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }
    expect(saveSheet.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps a deleted cell deleted when another version arrives before the save", async () => {
    let commit: Commit | null = null;
    let draft: TrackerSheet | undefined;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (source: TrackerSheet) => (
      <QueryClientProvider client={client}>
        <Live source={source} onReady={(next) => (commit = next)} onDraft={(next) => (draft = next)} />
      </QueryClientProvider>
    );
    const base = sheet();
    const view = render(tree(base));
    act(() => commit!((current) => ({ ...current, rows: [{ ...current.rows[0]!, cells: {} }] }) as TrackerSheet));
    // Somebody else's save lands, still holding the old value.
    view.rerender(tree({ ...base, updatedAt: "2026-01-01T00:00:00.500Z" }));
    expect(draft!.rows[0]!.cells.c1).toBeUndefined();
    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });
    const [, patch] = saveSheet.mock.calls[0]!;
    expect((patch.rows as Array<{ cells: Record<string, unknown> }>)[0]!.cells.c1).toBeUndefined();
  });

  it("shows another version straight away when nothing here is unsaved", () => {
    let draft: TrackerSheet | undefined;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (source: TrackerSheet) => (
      <QueryClientProvider client={client}>
        <Live source={source} onReady={() => undefined} onDraft={(next) => (draft = next)} />
      </QueryClientProvider>
    );
    const base = sheet();
    const view = render(tree(base));
    view.rerender(tree({ ...base, rows: [{ ...base.rows[0]!, cells: { c1: "theirs" } }], updatedAt: "2026-01-01T00:00:05.000Z" }));
    expect(draft!.rows[0]!.cells.c1).toBe("theirs");
  });
});
