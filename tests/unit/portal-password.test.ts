import { describe, expect, it } from "vitest";
import { hashPortalPassword, verifyPortalPassword } from "@/lib/auth/portal-password";

describe("portal passwords", () => {
  it("verifies the password it was made from, and nothing else", async () => {
    const stored = await hashPortalPassword("open sesame");
    expect(await verifyPortalPassword("open sesame", stored)).toBe(true);
    expect(await verifyPortalPassword("open sesam", stored)).toBe(false);
    expect(await verifyPortalPassword("", stored)).toBe(false);
  });

  it("salts every hash, so the same password stores differently each time", async () => {
    const a = await hashPortalPassword("same");
    const b = await hashPortalPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPortalPassword("same", a)).toBe(true);
    expect(await verifyPortalPassword("same", b)).toBe(true);
  });

  it("carries its own cost, so it can be raised without breaking old hashes", async () => {
    const stored = await hashPortalPassword("x");
    const [prefix, iterations] = stored.split("$");
    expect(prefix).toBe("pbkdf2");
    expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
  });

  it("refuses a malformed hash instead of throwing", async () => {
    for (const bad of ["", "nonsense", "pbkdf2$$$", "sha256$1$a$b", "pbkdf2$10$salt$hash"]) {
      expect(await verifyPortalPassword("x", bad)).toBe(false);
    }
  });
});
