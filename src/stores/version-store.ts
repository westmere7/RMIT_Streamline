import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CURRENT_VERSION, isNewerBuild, isVersionInfo, type VersionInfo } from "@/lib/version";

/**
 * What the server last said about its build, shared by the background watcher
 * (which raises the "new version" notice) and the settings page (which shows
 * the version and offers a manual check).
 */
export interface VersionState {
  /** The server's build as of the last successful check. */
  latest: VersionInfo | null;
  checkedAt: string | null;
  checking: boolean;
  /** The last check could not reach the server or got a non-JSON answer. */
  failed: boolean;
  /** Build id the person chose "Later" on; the notice stays quiet for that build. */
  dismissedBuildId: string | null;
  check: () => Promise<void>;
  dismiss: (buildId: string) => void;
}

export const useVersionStore = create<VersionState>()(
  persist(
    (set, get) => ({
      latest: null,
      checkedAt: null,
      checking: false,
      failed: false,
      dismissedBuildId: null,

      check: async () => {
        if (get().checking) return;
        set({ checking: true });
        try {
          const response = await fetch("/api/version", { cache: "no-store", headers: { Accept: "application/json" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body: unknown = await response.json();
          if (!isVersionInfo(body)) throw new Error("Unexpected version payload");
          set({ latest: body, checkedAt: new Date().toISOString(), checking: false, failed: false });
        } catch {
          // A deploy in progress or a flaky connection is not news; try again next tick.
          set({ checking: false, failed: true });
        }
      },

      dismiss: (buildId) => set({ dismissedBuildId: buildId }),
    }),
    {
      // "Later" is remembered for this tab only, so a fresh tab (which is the
      // new build anyway) starts clean.
      name: "streamline.version",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ dismissedBuildId: state.dismissedBuildId }),
    },
  ),
);

/** True when the server runs a build this page does not have. */
export function selectUpdateAvailable(state: Pick<VersionState, "latest">): boolean {
  return state.latest !== null && isNewerBuild(CURRENT_VERSION, state.latest);
}
