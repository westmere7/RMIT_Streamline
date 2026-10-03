/**
 * Whether the app can reach its server, watched from the browser.
 *
 * Every request the data client makes reports back here (see `monitoredFetch`).
 * One failure proves nothing — a tab waking from sleep, a dropped packet — so a
 * failure only starts a probe: a header-only read against the data server that
 * costs a few hundred bytes. Two probes failing in a row mark the server down;
 * from then on it is probed on a widening interval until it answers, and the
 * first answer marks it up again and tells the listeners (queries refetch, an
 * unsaved doc saves again).
 *
 * The device's own connection is folded in: no network is "offline", which
 * needs no probe. While nothing is wrong and nothing has been heard for a
 * minute, a visible tab probes once a minute, so an outage is noticed before
 * somebody types into it rather than after.
 */

export type ServerStatus = "ok" | "checking" | "down" | "offline";

/** Why the server counts as down: no answer at all, or an answer that is an error (maintenance, overload). */
export type DownReason = "unreachable" | "error";

export interface ServerStatusSnapshot {
  status: ServerStatus;
  /** When the next automatic probe runs, while down. */
  retryAt: number | null;
  /** When this outage began, down or offline. */
  since: number | null;
  /** Probes that have failed in this outage. */
  failures: number;
  reason: DownReason | null;
}

export const SERVER_OK: ServerStatusSnapshot = { status: "ok", retryAt: null, since: null, failures: 0, reason: null };

/** Waits between probes while down: quick at first, then every half minute. */
export const RETRY_STEPS_MS = [5_000, 10_000, 20_000, 30_000] as const;
/** How long the second, confirming probe waits after the first one failed. */
export const CONFIRM_DELAY_MS = 1_500;
/** A quiet, visible tab probes this often. */
export const HEARTBEAT_MS = 60_000;
/** The device has to stay without a network this long before it counts. */
export const OFFLINE_GRACE_MS = 2_000;

/** true or "up" when the server answered; false counts as unreachable. */
type ProbeResult = "up" | DownReason;
type Probe = () => Promise<boolean | ProbeResult>;

let snapshot: ServerStatusSnapshot = SERVER_OK;
const listeners = new Set<() => void>();
const recoveryListeners = new Set<() => void>();
let probe: Probe | null = null;
let probing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let lastHeard = 0;

function set(next: ServerStatusSnapshot) {
  if ((Object.keys(next) as (keyof ServerStatusSnapshot)[]).every((key) => next[key] === snapshot[key])) return;
  const wasBad = snapshot.status === "down" || snapshot.status === "offline";
  snapshot = next;
  listeners.forEach((listener) => listener());
  if (wasBad && next.status === "ok") recoveryListeners.forEach((listener) => listener());
}

export function getServerStatus(): ServerStatusSnapshot {
  return snapshot;
}

export function subscribeServerStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs once each time the server comes back after being down or offline. */
export function onServerRecovered(listener: () => void): () => void {
  recoveryListeners.add(listener);
  return () => recoveryListeners.delete(listener);
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(reason: DownReason, failed: number) {
  clearRetry();
  const wait = RETRY_STEPS_MS[Math.min(attempt, RETRY_STEPS_MS.length - 1)]!;
  attempt += 1;
  set({ status: "down", retryAt: Date.now() + wait, since: snapshot.since ?? Date.now(), failures: snapshot.failures + failed, reason });
  retryTimer = setTimeout(() => void checkNow(), wait);
}

async function runProbe(): Promise<ProbeResult> {
  if (!probe) return "up";
  try {
    const result = await probe();
    return result === true ? "up" : result === false ? "unreachable" : result;
  } catch {
    return "unreachable";
  }
}

/**
 * Probes now. While up, a failed probe is confirmed by a second one before the
 * server counts as down; while down, one answer is enough to bring it back.
 */
export function checkNow(): Promise<void> {
  if (!probe || snapshot.status === "offline") return Promise.resolve();
  // Without a network every probe fails; that is "offline", which the device says itself.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  if (probing) return probing;
  probing = (async () => {
    clearRetry();
    const wasDown = snapshot.status === "down";
    if (!wasDown) set({ ...SERVER_OK, status: "checking" });
    let result = await runProbe();
    let failed = result === "up" ? 0 : 1;
    if (result !== "up" && !wasDown) {
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAY_MS));
      result = await runProbe();
      if (result !== "up") failed += 1;
    }
    if (snapshot.status === "offline") return;
    if (result === "up") {
      attempt = 0;
      lastHeard = Date.now();
      set(SERVER_OK);
    } else {
      scheduleRetry(result, failed);
    }
  })().finally(() => {
    probing = null;
  });
  return probing;
}

/** A request to the server failed (network error or a 5xx): find out whether it is down. */
export function reportServerFailure(): void {
  if (snapshot.status === "ok") void checkNow();
}

/** A request got an answer. While down, that is as good as a probe. */
export function reportServerAnswer(): void {
  lastHeard = Date.now();
  if (snapshot.status === "down" && !probing) void checkNow();
}

/** The device lost or regained its network. */
export function setDeviceOnline(online: boolean): void {
  if (offlineTimer) clearTimeout(offlineTimer);
  offlineTimer = null;
  if (!online) {
    offlineTimer = setTimeout(() => {
      clearRetry();
      set({ status: "offline", retryAt: null, since: snapshot.since ?? Date.now() - OFFLINE_GRACE_MS, failures: 0, reason: null });
    }, OFFLINE_GRACE_MS);
    return;
  }
  if (snapshot.status !== "offline") return;
  if (!probe) {
    set(SERVER_OK);
    return;
  }
  attempt = 0;
  // Back on the network says nothing yet about the server; ask it.
  set({ status: "down", retryAt: null, since: snapshot.since, failures: 0, reason: null });
  void checkNow();
}

/** Probes a visible tab that has been quiet for a minute. */
export function heartbeat(): void {
  if (snapshot.status !== "ok" || !probe) return;
  if (Date.now() - lastHeard < HEARTBEAT_MS) return;
  void checkNow();
}

/** Installs the probe; null turns probing off (the local store has no server). */
export function setServerProbe(next: Probe | null): void {
  probe = next;
}

/** Back to a clean slate. Tests only. */
export function resetServerStatus(): void {
  clearRetry();
  if (offlineTimer) clearTimeout(offlineTimer);
  offlineTimer = null;
  probing = null;
  attempt = 0;
  lastHeard = 0;
  probe = null;
  snapshot = SERVER_OK;
  listeners.clear();
  recoveryListeners.clear();
}

/** Server errors that mean "not there right now" rather than "you may not". */
function isServerError(status: number): boolean {
  return status >= 500;
}

/**
 * The fetch the data client is built with. It changes nothing about the
 * request; it only tells the watcher above how it went. A request the page
 * itself cancelled is not a failure.
 */
export const monitoredFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init);
    if (isServerError(response.status)) reportServerFailure();
    else reportServerAnswer();
    return response;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) reportServerFailure();
    throw error;
  }
};

/**
 * The probe for the hosted data server: a header-only read of one table with
 * the public key. Row rules may well return nothing, or refuse; either way the
 * server answered. A 5xx is an error answer (maintenance, overload, a paused
 * project); no answer within eight seconds is unreachable.
 */
export function dataServerProbe(baseUrl: string, publicKey: string): Probe {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/workspaces?select=id&limit=1`;
  return async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { method: "HEAD", headers: { apikey: publicKey }, cache: "no-store", signal: controller.signal });
      return isServerError(response.status) ? "error" : "up";
    } finally {
      clearTimeout(timeout);
    }
  };
}
