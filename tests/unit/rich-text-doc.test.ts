import { describe, expect, it } from "vitest";
import { normalizeLinkHref } from "@/lib/rich-text";
import { docToRichText, richTextToDoc, type DocNode } from "@/lib/rich-text-doc";

const roundTrip = (body: string, names: string[] = []) => docToRichText(richTextToDoc(body, names));

describe("markup to document", () => {
  it("gives an empty update one empty paragraph", () => {
    expect(richTextToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("reads headings, lists, marks, links and mentions", () => {
    const doc = richTextToDoc("# Plan\n- **bold** and *it*\n[brief](https://example.com) @Tuyet Le", ["Tuyet Le"]);
    expect(doc.content?.[0]).toEqual({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plan" }] });
    expect(doc.content?.[1]).toEqual({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "bold", marks: [{ type: "bold" }] },
                { type: "text", text: " and " },
                { type: "text", text: "it", marks: [{ type: "italic" }] },
              ],
            },
          ],
        },
      ],
    });
    expect(doc.content?.[2]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "brief", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        { type: "text", text: " " },
        { type: "mention", attrs: { id: "Tuyet Le", label: "Tuyet Le" } },
      ],
    });
  });

  it("nests a colour around bold", () => {
    const doc = richTextToDoc("{c:red}**urgent**{/c}");
    expect(doc.content?.[0]?.content).toEqual([{ type: "text", text: "urgent", marks: [{ type: "textColor", attrs: { color: "red" } }, { type: "bold" }] }]);
  });
});

describe("document to markup", () => {
  it("round-trips what the renderer understands", () => {
    const body = ["# Cover plan", "**Print**, __final__ and *digital* all need it.", "- artwork", "- proof", "1. one", "2. two", "[the brief](https://example.com/brief)", "", "{c:red}blocked on photography{/c}", "---", "  ## Indented subheading", "  a step in", "  - an indented bullet"].join("\n");
    expect(roundTrip(body)).toBe(body);
  });

  it("keeps two paragraphs apart with a blank line", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "first" }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
      ],
    };
    expect(docToRichText(doc)).toBe("first\n\nsecond");
    expect(roundTrip("first\n\nsecond")).toBe("first\n\nsecond");
  });

  it("puts edge whitespace outside the markers and merges split runs", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a " },
            { type: "text", text: "bo", marks: [{ type: "bold" }] },
            { type: "text", text: "ld", marks: [{ type: "bold" }, { type: "italic" }] },
            { type: "text", text: " ", marks: [{ type: "bold" }] },
            { type: "text", text: "z" },
          ],
        },
      ],
    };
    expect(docToRichText(doc)).toBe("a **bo*ld*** z");
  });

  it("writes a bare address without a label and a mention as its name", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "https://example.com", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
            { type: "text", text: " " },
            { type: "mention", attrs: { id: "u1", label: "Jun Tanaka" } },
          ],
        },
      ],
    };
    expect(docToRichText(doc)).toBe("https://example.com @Jun Tanaka");
  });

  it("numbers an ordered list from its start", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "c" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "d" }] }] },
          ],
        },
      ],
    };
    expect(docToRichText(doc)).toBe("3. c\n4. d");
  });
});

describe("link addresses", () => {
  it("accepts web and mail addresses and fills in https", () => {
    expect(normalizeLinkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeLinkHref("  http://example.com ")).toBe("http://example.com");
    expect(normalizeLinkHref("example.com/brief")).toBe("https://example.com/brief");
    expect(normalizeLinkHref("www.rmit.edu.vn")).toBe("https://www.rmit.edu.vn");
    expect(normalizeLinkHref("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("rejects anything that is not a real address", () => {
    expect(normalizeLinkHref("")).toBeNull();
    expect(normalizeLinkHref("just words")).toBeNull();
    expect(normalizeLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkHref("data:text/html,hi")).toBeNull();
    expect(normalizeLinkHref("https://")).toBeNull();
    expect(normalizeLinkHref("https://nodot")).toBeNull();
    expect(normalizeLinkHref("ftp://example.com")).toBeNull();
  });
});
