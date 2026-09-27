import { describe, expect, it, vi } from "vitest";
import { asBookingHttpError } from "@/server/booking";
import { handleRoute } from "@/server/http";
import { asPortalHttpError } from "@/server/portal";
import { BookingValidationError } from "@/services/booking-service";

/** A route that fails the way POST /api/book/<slug> and the portal's book route do. */
const route = (map: (error: unknown) => never, error: Error) =>
  handleRoute(async () => {
    try {
      throw error;
    } catch (caught) {
      map(caught);
    }
  });

describe("booking refusals over HTTP", () => {
  it("answers a booking the form refuses with 400 and its reason, on the link and the portal", async () => {
    for (const map of [asBookingHttpError, asPortalHttpError]) {
      const response = await route(map, new BookingValidationError("What are you asking for? is required"))();
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "What are you asking for? is required" });
    }
  });

  it("still answers anything else with a generic 500", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await route(asBookingHttpError, new Error("connection reset"))();
    quiet.mockRestore();
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toContain("connection reset");
  });
});
