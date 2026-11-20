import { describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import { bookingHeaderOf } from "@/domain";
import { bookingFormTemplateSchema } from "@/services/booking";

/** The booking card's header (v0.126.0): the form's own words, else the page's name and "Task booking". */
describe("the booking form's header", () => {
  it("falls back to the page's name and 'Task booking' when blank or absent", () => {
    const template = fixtureBookingFormTemplate();
    expect(bookingHeaderOf(template, "RMIT Marketing")).toEqual({ title: "RMIT Marketing", subtitle: "Task booking" });
    template.header = { title: "  ", subtitle: null };
    expect(bookingHeaderOf(template, "RMIT Marketing")).toEqual({ title: "RMIT Marketing", subtitle: "Task booking" });
    expect(bookingHeaderOf(null, "Portal")).toEqual({ title: "Portal", subtitle: "Task booking" });
  });

  it("uses the form's own words, trimmed, and the schema keeps them", () => {
    const template = { ...fixtureBookingFormTemplate(), header: { title: " Central Creative ", subtitle: " Book the studio " } };
    const parsed = bookingFormTemplateSchema.parse(template);
    expect(parsed.header).toEqual({ title: "Central Creative", subtitle: "Book the studio" });
    expect(bookingHeaderOf({ ...template, header: parsed.header }, "RMIT Marketing")).toEqual({ title: "Central Creative", subtitle: "Book the studio" });
  });
});
