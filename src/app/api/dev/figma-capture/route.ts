import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Development only: saves a screen of the running app as a self-contained HTML
 * file under design/figma/screens, for html.to.design to bring into Figma. The
 * page posts its own markup (see design/figma/README.md); the app's stylesheet
 * is written once as app.css beside the screens, and any images the markup
 * points at are copied from public/ into screens/assets.
 *
 * Answers 404 anywhere but `next dev`, so nothing can write files on a server.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const body = (await request.json()) as { name?: string; html?: string; css?: string; assets?: string[] };
  const out = path.join(process.cwd(), "design", "figma", "screens");
  await fs.mkdir(path.join(out, "assets"), { recursive: true });
  const written: string[] = [];
  if (typeof body.css === "string") {
    await fs.writeFile(path.join(out, "app.css"), body.css);
    written.push("app.css");
  }
  if (typeof body.html === "string" && typeof body.name === "string") {
    const name = body.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    await fs.writeFile(path.join(out, `${name}.html`), body.html);
    written.push(`${name}.html`);
  }
  for (const asset of body.assets ?? []) {
    const clean = asset.replace(/^\/+/, "").replace(/\.\.+/g, "");
    const from = path.join(process.cwd(), "public", clean);
    try {
      await fs.copyFile(from, path.join(out, "assets", path.basename(clean)));
      written.push(`assets/${path.basename(clean)}`);
    } catch {
      // Not a file in public/ (a route or a data URL): left as it is.
    }
  }
  return NextResponse.json({ written });
}

/** Development only: the capture script itself (design/figma/capture.js), for a page to load and run. */
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const script = await fs.readFile(path.join(process.cwd(), "design", "figma", "capture.js"), "utf8");
  return new NextResponse(script, { headers: { "content-type": "text/javascript; charset=utf-8" } });
}
