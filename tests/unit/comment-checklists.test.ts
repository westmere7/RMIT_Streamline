import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS } from "@/data/seed/seed-data";
import { withCheck } from "@/domain";
import { checklistKeys, continueList, parseRichText, richTextToPlain } from "@/lib/rich-text";
import { docToRichText, richTextToDoc } from "@/lib/rich-text-doc";
import { createServices } from "@/services";

describe("checklist markup", () => {
  it("reads '- [ ]' lines as one checklist, apart from bullets around it", () => {
    const blocks = parseRichText("- a bullet\n- [ ] Send the proof\n- [x] **Book** the room\n\nAfter");
    expect(blocks.map((b) => b.type)).toEqual(["list", "checklist", "paragraph"]);
    const list = blocks[1]!;
    if (list.type !== "checklist") throw new Error("not a checklist");
    expect(list.items.map((i) => i.key)).toEqual(["send the proof", "book the room"]);
  });

  it("names a box by its words, so adding a line above keeps its tick and rewording clears it", () => {
    expect(checklistKeys("- [ ] Proof\n- [ ] Print")).toEqual(["proof", "print"]);
    expect(checklistKeys("- [ ] New first\n- [ ] Proof\n- [ ] Print")).toEqual(["new first", "proof", "print"]);
    expect(checklistKeys("- [ ] Proof  it\n- [ ] proof it")).toEqual(["proof it", "proof it#2"]);
  });

  it("drops its markers from the plain words and continues on Enter", () => {
    expect(richTextToPlain("- [ ] Send the proof\n- [x] Done one")).toBe("Send the proof\nDone one");
    expect(continueList("- [ ] Send")).toBe("- [ ] ");
    expect(continueList("- [ ] ")).toBe("");
  });

  it("round-trips through the composer, never storing a tick", () => {
    const doc = richTextToDoc("Todo\n\n- [x] One\n- [ ] Two");
    expect(doc.content?.[1]).toMatchObject({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false } }, { type: "taskItem" }] });
    expect(docToRichText(doc)).toBe("Todo\n- [ ] One\n- [ ] Two");
  });
});

describe("checklist ticks", () => {
  it("keeps who ticked first, and unticks", () => {
    const once = withCheck([], "a", "u1", true, "t1");
    expect(withCheck(once, "a", "u2", true, "t2")).toEqual([{ key: "a", userId: "u1", checkedAt: "t1" }]);
    expect(withCheck(once, "a", "u2", false, "t2")).toEqual([]);
  });

  it("are stored on the update and reach its copies on linked tasks", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `checklists-${Date.now()}` }));
    await services.repos.admin.resetToSeed();
    const [item] = await services.repos.items.listByBoard(SEED_BOARD_IDS.rmitinerary);
    const users = await services.repos.users.list();
    const comment = await services.comments.addComment(item!.id, "- [ ] Proof\n- [ ] Print", SEED_USER_IDS.danh, users);
    const other = Object.values(SEED_USER_IDS).find((id) => id !== SEED_USER_IDS.danh)!;
    await services.comments.setCheck(comment, "proof", other, true);
    let stored = (await services.comments.listByItem(item!.id)).find((c) => c.id === comment.id)!;
    expect(stored.checks).toMatchObject([{ key: "proof", userId: other }]);
    // Ticking is not editing: the text and its edited time stay as they were.
    expect(stored.body).toBe(comment.body);
    expect(stored.updatedAt).toBe(comment.updatedAt);
    await services.comments.setCheck(comment, "proof", SEED_USER_IDS.danh, false);
    stored = (await services.comments.listByItem(item!.id)).find((c) => c.id === comment.id)!;
    expect(stored.checks).toEqual([]);
  });
});
