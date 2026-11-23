import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocContent } from "@/domain";
import { useDocSaver } from "@/features/docs/hooks";
import { hasUnsavedWork, resetUnsavedWork } from "@/lib/unsaved-work";

/**
 * A doc saves 800 ms after typing stops (v0.161): never lost to leaving the
 * page or the screen in that time, and the leave-page prompt is on until it
 * has landed.
 */
const update = vi.fn(async (docId: string, patch: { content: DocContent }) => ({ id: docId, ...patch }));

vi.mock("@/features/data/data-context", () => ({
  useServices: () => ({ docs: { update } }),
  useDataContext: () => ({ providerKind: "local" }),
}));
vi.mock("@/features/auth/auth-context", () => ({ useCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/features/workspace/workspace-context", () => ({ useWorkspace: () => ({ workspace: { id: "ws-1" } }) }));
vi.mock("@/lib/realtime/local-realtime", () => ({ publishDataChange: () => undefined }));

const content = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }) as unknown as DocContent;
const textOf = (call: unknown[]) => JSON.stringify((call[1] as { content: DocContent }).content);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useDocSaver("doc-1"), { wrapper });
}

describe("a doc's save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    update.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetUnsavedWork();
  });

  it("waits for typing to stop, then saves the last of it once", async () => {
    const { result } = setup();
    act(() => result.current.save(content("a")));
    act(() => result.current.save(content("ab")));
    expect(hasUnsavedWork()).toBe(true);
    await act(async () => void vi.advanceTimersByTime(500));
    expect(update).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(400));
    expect(update).toHaveBeenCalledTimes(1);
    expect(textOf(update.mock.calls[0]!)).toContain('"ab"');
    expect(hasUnsavedWork()).toBe(false);
  });

  it("saves at once when the page is hidden or closed inside the pause", async () => {
    const { result } = setup();
    act(() => result.current.save(content("leaving")));
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(textOf(update.mock.calls[0]!)).toContain('"leaving"');
  });

  it("saves what is waiting when the editor goes away", async () => {
    const { result, unmount } = setup();
    act(() => result.current.save(content("switching docs")));
    unmount();
    await act(async () => undefined);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
