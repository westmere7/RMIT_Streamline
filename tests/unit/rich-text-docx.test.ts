import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { docxFileName, richTextToDocx, richTextToDocxBody } from "@/lib/rich-text-docx";

const BRIEF = [
  "**Service:** Design",
  "",
  "**Involves:** Print, Installation",
  "",
  "---",
  "",
  "## 1. What are you asking for?",
  "Signage for **Open Day** & the tram stop <welcome>.",
  "",
  "- Building markers",
  "- Lift directories",
  "",
  "## 2. Where are the assets?",
  "[Asset folder](https://example.com/assets?a=1&b=2)",
].join("\n");

describe("richTextToDocx", () => {
  it("heads the document with the service and what it involves, then the questions as headings", () => {
    const { xml, links } = richTextToDocxBody(BRIEF, "Campus signage - Brief");
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain(">Campus signage - Brief<");
    expect(xml.indexOf(">Design<")).toBeLessThan(xml.indexOf("What are you asking for?"));
    expect(xml).toContain(">Print  ·  Installation<");
    // The facts come out of the body: they are not repeated as bold lines under the header.
    expect(xml).not.toContain(">Service:<");
    expect((xml.match(/<w:pStyle w:val="Heading2"\/>/g) ?? []).length).toBe(2);
    expect(xml).toContain("&amp; the tram stop &lt;welcome&gt;.");
    expect(xml).toContain("<w:b/>");
    expect((xml.match(/•\t/g) ?? []).length).toBe(2);
    expect(links).toEqual(["https://example.com/assets?a=1&b=2"]);
    expect(xml).toContain('<w:hyperlink r:id="rLink1"');
  });

  it("packages a Word file with its styles and its links", async () => {
    const blob = await richTextToDocx(BRIEF, "Campus signage - Brief");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["[Content_Types].xml", "_rels/", "_rels/.rels", "word/", "word/_rels/", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"]);
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain('Id="rLink1"');
    expect(rels).toContain('Target="https://example.com/assets?a=1&amp;b=2" TargetMode="External"');
    if (process.env.DOCX_SAMPLE) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.DOCX_SAMPLE, Buffer.from(await blob.arrayBuffer()));
    }
  });

  it("names the file something any file system accepts", () => {
    expect(docxFileName("Open Day: signage / print - Brief")).toBe("Open Day- signage - print - Brief.docx");
    expect(docxFileName("  ")).toBe("Document.docx");
  });
});
