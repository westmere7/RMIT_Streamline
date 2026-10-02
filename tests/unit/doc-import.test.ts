import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { markdownToHtml, readDocFile, textToHtml, titleFromFileName } from "@/features/docs/doc-import";

describe("bringing a file into a doc", () => {
  it("names the doc after the file", () => {
    expect(titleFromFileName("Brand_voice_notes.docx")).toBe("Brand voice notes");
    expect(titleFromFileName(".md")).toBe("Untitled");
  });

  it("reads Markdown's headings, lists, to-dos, quotes, code, rules and inline marks", () => {
    const html = markdownToHtml(["# Title", "", "Some **bold**, *italic*, `code` and [a link](https://example.com).", "", "- one", "- two", "", "1. first", "2. second", "", "- [ ] open", "- [x] done", "", "> quoted", "", "```", "<b>raw</b>", "```", "", "---"].join("\n"));
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com">a link</a>');
    expect(html).toContain("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
    expect(html).toContain("<ol><li><p>first</p></li><li><p>second</p></li></ol>");
    expect(html).toContain('<li data-type="taskItem" data-checked="false"><p>open</p></li>');
    expect(html).toContain('data-checked="true"><p>done</p>');
    expect(html).toContain("<blockquote><p>quoted</p></blockquote>");
    expect(html).toContain("<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>");
    expect(html).toContain("<hr>");
  });

  it("never lets Markdown carry markup or a script link in", () => {
    const html = markdownToHtml('<script>alert(1)</script> and [x](javascript:alert(1))');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });

  it("turns plain text into paragraphs, keeping single line breaks", () => {
    expect(textToHtml("one\ntwo\n\nthree")).toBe("<p>one<br>two</p><p>three</p>");
  });

  it("reads a Word document's headings, paragraphs and emphasis", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file(
      "word/document.xml",
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Launch plan</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Ship on </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Monday</w:t></w:r></w:p></w:body></w:document>',
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const file = new File([bytes as BlobPart], "Launch plan.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const read = await readDocFile(file);
    expect(read.kind).toBe("page");
    if (read.kind !== "page") return;
    expect(read.title).toBe("Launch plan");
    expect(read.html).toContain("<h1>Launch plan</h1>");
    expect(read.html).toContain("<strong>Monday</strong>");
  });

  it("keeps a PDF as it is, and turns away an old .doc", async () => {
    const pdf = await readDocFile(new File(["%PDF-1.4"], "Guide.pdf", { type: "application/pdf" }));
    expect(pdf.kind).toBe("pdf");
    await expect(readDocFile(new File(["x"], "Old.doc"))).rejects.toThrow(/\.docx/);
  });
});
