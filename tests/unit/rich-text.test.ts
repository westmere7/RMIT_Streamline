import { describe, expect, it } from "vitest";
import { continueList, parseInline, parseRichText, richTextToPlain, togglePrefix, wrapSelection } from "@/lib/rich-text";

describe("inline markup", () => {
  it("leaves plain text alone", () => {
    expect(parseInline("just words")).toEqual([{ type: "text", text: "just words" }]);
  });

  it("reads bold and italic", () => {
    expect(parseInline("a **bold** word")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " word" },
    ]);
    expect(parseInline("*just italic*")).toEqual([{ type: "italic", children: [{ type: "text", text: "just italic" }] }]);
  });

  it("reads a colour from the palette and ignores one that is not", () => {
    expect(parseInline("{c:red}urgent{/c}")).toEqual([{ type: "color", color: "red", children: [{ type: "text", text: "urgent" }] }]);
    expect(parseInline("{c:chartreuse}odd{/c}")).toEqual([{ type: "text", text: "{c:chartreuse}odd{/c}" }]);
  });

  it("reads a written link and a bare address", () => {
    expect(parseInline("see [the brief](https://example.com/a)")).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://example.com/a", label: "the brief" },
    ]);
    expect(parseInline("go to https://example.com/b now")).toEqual([
      { type: "text", text: "go to " },
      { type: "link", href: "https://example.com/b", label: "https://example.com/b" },
      { type: "text", text: " now" },
    ]);
  });

  it("refuses an address that is not a web address", () => {
    // A javascript: or data: URL stays exactly what it is: text.
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ type: "text", text: "[click](javascript:alert(1))" }]);
    expect(parseInline("[click](data:text/html,<script>)")).toEqual([{ type: "text", text: "[click](data:text/html,<script>)" }]);
  });

  it("marks a mention only when the name belongs to the workspace", () => {
    const names = ["Danh Nguyen", "Tuyet Le"];
    expect(parseInline("@Tuyet Le please look", names)).toEqual([
      { type: "mention", name: "Tuyet Le" },
      { type: "text", text: " please look" },
    ]);
    expect(parseInline("@Nobody Here", names)).toEqual([{ type: "text", text: "@Nobody Here" }]);
  });

  it("prefers the longer name when one is a prefix of another", () => {
    expect(parseInline("@Danh Nguyen", ["Danh", "Danh Nguyen"])).toEqual([{ type: "mention", name: "Danh Nguyen" }]);
  });

  it("nests marks", () => {
    expect(parseInline("**bold with [a link](https://example.com)**")).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "bold with " },
          { type: "link", href: "https://example.com", label: "a link" },
        ],
      },
    ]);
  });
});

describe("blocks", () => {
  it("splits headings, lists and paragraphs", () => {
    const blocks = parseRichText(["# Plan", "", "First paragraph", "", "- one", "- two", "", "1. step", "2. step"].join("\n"));
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("keeps a bulleted list and a numbered list apart even when they touch", () => {
    const blocks = parseRichText(["- one", "1. two"].join("\n"));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ ordered: false });
    expect(blocks[1]).toMatchObject({ ordered: true });
  });

  it("treats an update written before any of this as one paragraph", () => {
    expect(parseRichText("Printer confirmed the spot UV area.")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Printer confirmed the spot UV area." }] },
    ]);
  });

  it("reduces to plain text for a notification body", () => {
    expect(richTextToPlain("# Heading\n**bold** and {c:red}red{/c}\n- a bullet\n[label](https://example.com)")).toBe(
      "Heading\nbold and red\na bullet\nlabel",
    );
  });
});

describe("typing helpers", () => {
  it("continues a bulleted list and ends it on an empty item", () => {
    expect(continueList("- something")).toBe("- ");
    expect(continueList("  - indented")).toBe("  - ");
    expect(continueList("- ")).toBe("");
    expect(continueList("plain text")).toBeNull();
  });

  it("numbers the next item", () => {
    expect(continueList("1. first")).toBe("2. ");
    expect(continueList("9) ninth")).toBe("10) ");
    expect(continueList("3. ")).toBe("");
  });

  it("wraps a selection, and offers a placeholder when there is none", () => {
    expect(wrapSelection("say hello now", 4, 9, "**", "**")).toEqual({
      value: "say **hello** now",
      selectionStart: 6,
      selectionEnd: 11,
    });
    expect(wrapSelection("", 0, 0, "**", "**", "bold text")).toEqual({
      value: "**bold text**",
      selectionStart: 2,
      selectionEnd: 11,
    });
  });

  it("adds and removes a line prefix across the selection", () => {
    const bulleted = togglePrefix("one\ntwo", 0, 7, () => "- ");
    expect(bulleted.value).toBe("- one\n- two");
    expect(togglePrefix(bulleted.value, 0, bulleted.value.length, () => "- ").value).toBe("one\ntwo");
  });

  it("numbers each line when it adds a numbered list", () => {
    expect(togglePrefix("one\ntwo\nthree", 0, 13, (i) => `${i + 1}. `).value).toBe("1. one\n2. two\n3. three");
  });
});
