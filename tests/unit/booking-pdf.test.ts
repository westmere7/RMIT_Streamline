import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureBookingFormTemplate } from "./helpers/booking-fixture";
import type { BookingReceipt, BookingRequest } from "@/domain";
import { buildBookingPdf, fileName } from "@/features/booking/booking-pdf";

const receipt: BookingReceipt = {
  ticket: "CP_042",
  itemId: "item-1",
  itemName: "Lễ tốt nghiệp: Open Day wayfinding posters",
  boardId: "board-1",
  boardName: "Task Allocation",
  teamName: null,
  assetCount: 2,
  submittedAt: "2026-11-20T03:15:00.000Z",
} as BookingReceipt;

const request: BookingRequest = {
  requesterName: "Nguyễn Thị Ánh",
  requesterEmail: "anh.nguyen@rmit.edu.vn",
  department: "Comm.",
  title: "Lễ tốt nghiệp: Open Day wayfinding posters",
  brief: "",
  assetTypes: ["Print"],
  assets: [
    { name: "A1 poster", quantity: 6, spec: "594×841 mm, CMYK, print ready", assetType: "Print" },
    { name: "Instagram tile", quantity: null, spec: null },
  ],
  serviceTypeId: "svc-design",
  subServices: ["Print", "Digital / Social"],
  teamId: null,
  dueDate: "2026-12-02",
  priority: "High",
  referenceUrl: "https://example.com/brief",
  answers: {
    "design-what": { kind: "text", text: "Sáu áp phích A1 cho cơ sở Nam Sài Gòn, đúng nhận diện thương hiệu. ".repeat(70) },
    "design-specs": { kind: "text", text: "A1 portrait for print, plus 1080x1350 for Instagram." },
    "design-copy": { kind: "choice", values: ["Yes, final and approved"] },
  },
};

const geist = async () => new Uint8Array(readFileSync("public/fonts/Geist-Regular.ttf"));
// The logos are drawn into PNGs by the browser; a test can hand some in (BOOKING_PDF_LOGOS: rmit.png,app.png).
const logos = async () => {
  const files = process.env.BOOKING_PDF_LOGOS?.split(",");
  if (!files) return { rmit: null, app: null };
  const png = (path: string, ratio: number) => ({ data: `data:image/png;base64,${readFileSync(path).toString("base64")}`, ratio });
  return { rmit: png(files[0]!, 76.2 / 219.7), app: png(files[1]!, 137.21 / 739.75) };
};

describe("the booking PDF", () => {
  it("draws the booking on A4 with Geist, over as many pages as it needs", async () => {
    const doc = await buildBookingPdf({ receipt, request, template: fixtureBookingFormTemplate(), workspaceName: "Central Creative Team" }, { font: geist, logos });
    // A brief this long runs onto a second page.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(doc.getFontList().Geist).toBeDefined();
    const bytes = doc.output("arraybuffer");
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // Set BOOKING_PDF_OUT to look at it.
    if (process.env.BOOKING_PDF_OUT) writeFileSync(process.env.BOOKING_PDF_OUT, Buffer.from(bytes));
  });

  it("still draws without the font, in the built-in one", async () => {
    const doc = await buildBookingPdf({ receipt, request, template: fixtureBookingFormTemplate(), workspaceName: "Central Creative Team" }, { font: async () => null });
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });

  it("names the file after the ticket and the task, without accents", () => {
    expect(fileName(receipt)).toBe("CP_042-le-tot-nghiep-open-day-wayfinding-posters.pdf");
  });
});
