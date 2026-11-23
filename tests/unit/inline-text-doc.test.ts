import { describe, expect, it } from "vitest";
import { docToInlineText, inlineTextToDoc } from "@/lib/rich-text-doc";

describe("the form editor's formatting boxes", () => {
  it("keep bold, italic, underline and links through a round trip", () => {
    const text = "So we know who to **come back** to, *when* and __why__ — see [our teams](https://rmit.edu.vn/teams).";
    expect(docToInlineText(inlineTextToDoc(text))).toBe(text);
  });

  it("read a leading number, dash or hash as words, never a list or a heading", () => {
    for (const text of ["1. Upload the files", "- one thing", "# not a heading"]) {
      const doc = inlineTextToDoc(text);
      expect(doc.content?.map((n) => n.type)).toEqual(["paragraph"]);
      expect(docToInlineText(doc)).toBe(text);
    }
  });

  it("keep one line per paragraph, and drop empty lines at the end", () => {
    expect(docToInlineText(inlineTextToDoc("First line\nSecond line\n\n"))).toBe("First line\nSecond line");
  });
});

describe("a formatted question label", () => {
  it("reads as plain words in a brief, an error or an aria-label, number kept", async () => {
    const { plainLabel } = await import("@/lib/rich-text");
    expect(plainLabel("Who is the **audience**? See [our guide](https://rmit.edu.vn/guide)")).toBe("Who is the audience? See our guide");
    expect(plainLabel("1. __Sizes__ and *dimensions*")).toBe("1. Sizes and dimensions");
  });
});
