import { describe, expect, it } from "vitest";
import { describeSignInError } from "@/lib/auth/auth-messages";

describe("sign-in error messages", () => {
  it("turns Supabase's terse strings into plain instructions", () => {
    expect(describeSignInError("Invalid login credentials")).toMatch(/do not match/);
    expect(describeSignInError("Email not confirmed")).toMatch(/not been confirmed/);
    expect(describeSignInError("Request rate limit reached")).toMatch(/Wait a minute/);
    expect(describeSignInError("TypeError: Failed to fetch")).toMatch(/connection/);
  });

  it("keeps a message it does not recognise, and never returns nothing", () => {
    expect(describeSignInError("Password is required.")).toBe("Password is required.");
    expect(describeSignInError("   ")).toBe("Sign in failed. Try again.");
  });
});
