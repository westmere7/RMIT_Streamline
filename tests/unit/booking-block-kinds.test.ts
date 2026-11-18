import { describe, expect, it } from "vitest";
import type { BookingBlock, BookingChoiceBlock, BookingRequest } from "@/domain";
import { BOOKING_STANDARD_KEYS, convertBlock, defaultBookingFormTemplate, newBookingBlock, newStandardField, switchableKinds, usableAnswer } from "@/domain";
import { composeBrief, normaliseBookingTemplate, readBookingBlock, validateBookingStep } from "@/services/booking";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";

const single = (): BookingChoiceBlock => ({
  id: "q1",
  kind: "single",
  label: "People on camera?",
  description: "Anyone recognisable.",
  required: true,
  display: "dropdown",
  options: [
    { name: "Yes", color: "green" },
    { name: "No", color: "gray" },
  ],
  followUps: {
    Yes: [
      { id: "q1a", kind: "short", label: "Who arranges consent?", description: null, required: true },
      { id: "q1b", kind: "ack", label: "Consent forms will be signed", description: null, required: true },
    ],
  },
});

describe("switching a question's kind", () => {
  it("offers the kinds that carry the same wording, and nothing for the rest", () => {
    expect(switchableKinds("short")).toEqual(["short", "long", "link"]);
    expect(switchableKinds("multi")).toEqual(["single", "multi"]);
    expect(switchableKinds("ack")).toEqual(["ack"]);
    expect(switchableKinds("text")).toEqual(["text"]);
  });

  it("keeps the id, the question, its line, required and the options", () => {
    const short: BookingBlock = { id: "s", kind: "short", label: "Where?", description: "Campus and room", required: true };
    expect(convertBlock(short, "long")).toEqual({ block: { ...short, kind: "long" }, dropped: [] });
    expect(convertBlock(short, "link")).toEqual({ block: { ...short, kind: "link" }, dropped: [] });

    const multi: BookingChoiceBlock = { id: "m", kind: "multi", label: "Formats", description: null, required: false, options: single().options };
    expect(convertBlock(multi, "single")).toEqual({ block: { ...multi, kind: "single" }, dropped: [] });
  });

  it("says what a single choice loses on becoming a multiple choice: its follow-ups", () => {
    const { block, dropped } = convertBlock(single(), "multi");
    expect(dropped).toEqual(["2 follow-up questions"]);
    expect(block).toEqual({ id: "q1", kind: "multi", label: "People on camera?", description: "Anyone recognisable.", required: true, options: single().options });
    // With no follow-ups there is nothing written to lose, so nothing to ask.
    expect(convertBlock({ ...single(), followUps: undefined }, "multi").dropped).toEqual([]);
  });

  it("will not cross between groups or turn furniture into a question", () => {
    const short: BookingBlock = { id: "s", kind: "short", label: "Where?", description: null, required: false };
    expect(convertBlock(short, "multi").block).toBe(short);
    const text = newBookingBlock("text");
    expect(convertBlock(text, "short").block).toBe(text);
  });
});

describe("a question added to the form", () => {
  it("is required until someone says otherwise", () => {
    for (const kind of ["short", "long", "multi", "single", "link", "ack"] as const) expect(newBookingBlock(kind)).toMatchObject({ required: true });
    for (const key of BOOKING_STANDARD_KEYS) expect(newStandardField(key).required).toBe(true);
  });
});

describe("an answer given before its question changed kind", () => {
  it("counts only while its shape still fits", () => {
    const short: BookingBlock = { id: "s", kind: "short", label: "Where?", description: null, required: false };
    expect(usableAnswer({ ...short, kind: "long" }, { kind: "text", text: "Room 4" })).toEqual({ kind: "text", text: "Room 4" });
    expect(usableAnswer({ ...short, kind: "link" }, { kind: "text", text: "Room 4" })).toBeUndefined();
    // A multiple choice that became a single one keeps the first choice.
    expect(usableAnswer(single(), { kind: "choice", values: ["Yes", "No"] })).toEqual({ kind: "choice", values: ["Yes"] });
  });
});

describe("an acknowledgement", () => {
  const withAck = () => {
    const template = fixtureBookingFormTemplate();
    const service = template.services.find((s) => s.id === "svc-design")!;
    service.blocks = [{ id: "ack-logo", kind: "ack", label: "The logo files are the approved ones", description: null, required: false }];
    return template;
  };
  const request = (answers: BookingRequest["answers"]): BookingRequest => ({
    requesterName: "Ana",
    requesterEmail: "ana@example.edu",
    department: null,
    title: "Posters",
    brief: "",
    assetTypes: [],
    assets: [],
    serviceTypeId: "svc-design",
    subServices: [],
    teamId: null,
    dueDate: null,
    priority: null,
    referenceUrl: null,
    answers,
    itemId: null,
  });

  it("is added required, and stored required whatever the form said", () => {
    expect(newBookingBlock("ack")).toMatchObject({ kind: "ack", required: true });
    const stored = normaliseBookingTemplate(withAck());
    expect(stored.services.find((s) => s.id === "svc-design")!.blocks[0]).toMatchObject({ kind: "ack", required: true });
    // Inside a branch too, and as a saved block.
    const template = defaultBookingFormTemplate();
    template.services[0]!.blocks = [single()];
    (template.services[0]!.blocks[0] as BookingChoiceBlock).followUps!.Yes![1] = { id: "q1b", kind: "ack", label: "Consent forms will be signed", description: null, required: false };
    const follow = (normaliseBookingTemplate(template).services[0]!.blocks[0] as BookingChoiceBlock).followUps!.Yes![1]!;
    expect(follow).toMatchObject({ kind: "ack", required: true });
    expect(readBookingBlock({ id: "a", kind: "ack", label: "I confirm", description: null, required: false })).toMatchObject({ required: true });
  });

  it("holds the brief until it is ticked, and reads as Confirmed in it", () => {
    const template = normaliseBookingTemplate(withAck());
    expect(validateBookingStep("brief", request({}), template)).toEqual({ "ack-logo": "Tick “The logo files are the approved ones” to go on" });
    expect(validateBookingStep("brief", request({ "ack-logo": { kind: "ack", agreed: false } }), template)).toEqual({ "ack-logo": "Tick “The logo files are the approved ones” to go on" });
    const ticked = request({ "ack-logo": { kind: "ack", agreed: true } });
    expect(validateBookingStep("brief", ticked, template)).toEqual({});
    expect(composeBrief(ticked, template)).toContain("## 1. The logo files are the approved ones\nConfirmed");
  });
});
