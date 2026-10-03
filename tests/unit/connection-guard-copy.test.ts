import { describe, expect, it } from "vitest";
import { coverCopy, outageLength } from "@/components/shared/connection-guard";
import { SERVER_OK } from "@/lib/server-status";

describe("the connection cover's words", () => {
  it("tells an outage from an error answer and from being offline", () => {
    expect(coverCopy({ ...SERVER_OK, status: "down", reason: "unreachable" }).title).toBe("Can’t reach the server");
    expect(coverCopy({ ...SERVER_OK, status: "down", reason: "error" }).lead).toMatch(/maintenance/);
    expect(coverCopy({ ...SERVER_OK, status: "offline" }).title).toBe("You’re offline");
    expect(coverCopy({ ...SERVER_OK, status: "down" }).title).toBe("Reconnecting");
  });

  it("never names the backend", () => {
    for (const snapshot of [{ ...SERVER_OK, status: "down" as const, reason: "unreachable" as const }, { ...SERVER_OK, status: "down" as const, reason: "error" as const }, { ...SERVER_OK, status: "offline" as const }]) {
      const { title, lead } = coverCopy(snapshot);
      expect(`${title} ${lead}`).not.toMatch(/supabase|postgres|vercel/i);
    }
  });

  it("says how long it has lasted", () => {
    expect(outageLength(20_000)).toBe("under a minute");
    expect(outageLength(3 * 60_000)).toBe("3 min");
    expect(outageLength(65 * 60_000)).toBe("1 h 5 min");
    expect(outageLength(120 * 60_000)).toBe("2 h");
  });
});
