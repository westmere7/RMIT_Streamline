import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkNow,
  CONFIRM_DELAY_MS,
  getServerStatus,
  heartbeat,
  HEARTBEAT_MS,
  monitoredFetch,
  OFFLINE_GRACE_MS,
  onServerRecovered,
  reportServerFailure,
  resetServerStatus,
  RETRY_STEPS_MS,
  setDeviceOnline,
  setServerProbe,
} from "@/lib/server-status";

describe("server status", () => {
  let up = true;
  const probe = vi.fn(async () => up);

  beforeEach(() => {
    vi.useFakeTimers();
    resetServerStatus();
    up = true;
    probe.mockClear();
    setServerProbe(probe);
  });

  afterEach(() => {
    resetServerStatus();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays up when one failure is not confirmed", async () => {
    reportServerFailure();
    await vi.runAllTimersAsync();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(getServerStatus().status).toBe("ok");
  });

  it("marks the server down only after two failed probes", async () => {
    up = false;
    reportServerFailure();
    await vi.advanceTimersByTimeAsync(0);
    expect(getServerStatus().status).toBe("checking");
    await vi.advanceTimersByTimeAsync(CONFIRM_DELAY_MS);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(getServerStatus().status).toBe("down");
    expect(getServerStatus().retryAt).toBe(Date.now() + RETRY_STEPS_MS[0]);
  });

  it("says why it is down, since when, and how many checks failed", async () => {
    const started = Date.now();
    probe.mockImplementation(async () => "error" as unknown as boolean);
    reportServerFailure();
    await vi.advanceTimersByTimeAsync(CONFIRM_DELAY_MS);
    expect(getServerStatus()).toMatchObject({ status: "down", reason: "error", failures: 2, since: started + CONFIRM_DELAY_MS });
    probe.mockImplementation(async () => false);
    await vi.advanceTimersByTimeAsync(RETRY_STEPS_MS[0]);
    expect(getServerStatus()).toMatchObject({ reason: "unreachable", failures: 3, since: started + CONFIRM_DELAY_MS });
    probe.mockImplementation(async () => up);
    up = true;
    await checkNow();
    expect(getServerStatus()).toMatchObject({ status: "ok", reason: null, failures: 0, since: null });
  });

  it("retries on a widening interval and recovers on the first answer", async () => {
    const recovered = vi.fn();
    onServerRecovered(recovered);
    up = false;
    reportServerFailure();
    await vi.advanceTimersByTimeAsync(CONFIRM_DELAY_MS);
    await vi.advanceTimersByTimeAsync(RETRY_STEPS_MS[0]);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(getServerStatus().retryAt).toBe(Date.now() + RETRY_STEPS_MS[1]);
    up = true;
    await vi.advanceTimersByTimeAsync(RETRY_STEPS_MS[1]);
    expect(getServerStatus().status).toBe("ok");
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("checks at once when asked, while down", async () => {
    up = false;
    reportServerFailure();
    await vi.advanceTimersByTimeAsync(CONFIRM_DELAY_MS);
    up = true;
    await checkNow();
    expect(getServerStatus().status).toBe("ok");
  });

  it("goes offline after the grace period and asks the server on reconnect", async () => {
    const recovered = vi.fn();
    onServerRecovered(recovered);
    setDeviceOnline(false);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS - 1);
    expect(getServerStatus().status).toBe("ok");
    await vi.advanceTimersByTimeAsync(1);
    expect(getServerStatus().status).toBe("offline");
    setDeviceOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(getServerStatus().status).toBe("ok");
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("ignores a blip shorter than the grace period", async () => {
    setDeviceOnline(false);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS / 2);
    setDeviceOnline(true);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);
    expect(getServerStatus().status).toBe("ok");
    expect(probe).not.toHaveBeenCalled();
  });

  it("goes offline without a probe when there is no server to probe", async () => {
    setServerProbe(null);
    setDeviceOnline(false);
    await vi.advanceTimersByTimeAsync(OFFLINE_GRACE_MS);
    expect(getServerStatus().status).toBe("offline");
    setDeviceOnline(true);
    expect(getServerStatus().status).toBe("ok");
  });

  it("probes a quiet tab once a minute, not a busy one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    heartbeat();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    await monitoredFetch("https://example.test/rest/v1/items");
    heartbeat();
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    heartbeat();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("reports network errors and 5xx answers, not 4xx or a cancelled request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await monitoredFetch("https://example.test/a");
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(monitoredFetch("https://example.test/b")).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await monitoredFetch("https://example.test/c");
    await vi.runAllTimersAsync();
    expect(probe).toHaveBeenCalledTimes(1);

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(monitoredFetch("https://example.test/d")).rejects.toThrow("Failed to fetch");
    await vi.runAllTimersAsync();
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
