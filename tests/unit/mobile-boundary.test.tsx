import { render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOBILE_MAX_WIDTH, useAutoCollapseSidebar, useIsMobile } from "@/hooks/use-mobile";
import { useUiStore } from "@/stores/ui-store";

/**
 * A matchMedia that actually answers, so the boundary can be asserted rather
 * than assumed. jsdom has none, and the shared stub in tests/setup.ts always
 * says false — fine for a desktop-shaped test, useless for this one.
 */
function setViewport(width: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, writable: true, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const max = /\(max-width:\s*(\d+)px\)/.exec(query);
      return {
        matches: max ? width <= Number(max[1]) : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    },
  });
}

afterEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, sidebarWidth: 260 });
});

describe("the responsive boundary", () => {
  it("is exactly 767/768", () => {
    expect(MOBILE_MAX_WIDTH).toBe(767);

    setViewport(767);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);

    setViewport(768);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it("keeps the phone shell off every width a tablet or desktop uses", () => {
    for (const width of [768, 1023, 1024, 1280, 1440, 1920]) {
      setViewport(width);
      expect(renderHook(() => useIsMobile()).result.current, `${width}px should use the existing interface`).toBe(false);
    }
    for (const width of [320, 360, 390, 430, 767]) {
      setViewport(width);
      expect(renderHook(() => useIsMobile()).result.current, `${width}px should use the phone shell`).toBe(true);
    }
  });

  it("folds the sidebar below 1024 without touching the stored preference", () => {
    setViewport(1023);
    expect(renderHook(() => useAutoCollapseSidebar()).result.current).toBe(true);
    setViewport(1024);
    expect(renderHook(() => useAutoCollapseSidebar()).result.current).toBe(false);
  });
});

describe("desktop state isolation", () => {
  it("leaves the sidebar preference alone when the app is opened on a phone", () => {
    useUiStore.setState({ sidebarCollapsed: false, sidebarWidth: 301 });

    setViewport(390);
    // Reading the hook is what the shell does; nothing about being narrow may
    // write into the preference the desktop reads back.
    renderHook(() => useIsMobile());
    renderHook(() => useAutoCollapseSidebar());

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(useUiStore.getState().sidebarWidth).toBe(301);
  });

  it("survives a desktop → mobile → desktop round trip", () => {
    useUiStore.setState({ sidebarCollapsed: true, sidebarWidth: 340 });

    for (const width of [1440, 390, 1440]) {
      setViewport(width);
      renderHook(() => useIsMobile());
    }

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiStore.getState().sidebarWidth).toBe(340);
  });
});

describe("useIsMobile on the server", () => {
  it("renders the desktop branch first, so hydration matches the server markup", () => {
    setViewport(390);
    function Probe() {
      return <span data-testid="probe">{useIsMobile() ? "mobile" : "desktop"}</span>;
    }
    render(<Probe />);
    // The server snapshot is false and the real answer arrives on the first
    // commit; by the time the tree is committed here it already reads mobile.
    expect(screen.getByTestId("probe")).toHaveTextContent("mobile");
  });
});
