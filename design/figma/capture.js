/*
 * Paste into the browser console of the app running under `next dev` (or run
 * it from a DevTools snippet) to save the page on screen into
 * design/figma/screens/<name>.html, ready for html.to.design.
 *
 *   await streamlineCapture("board-table-light")
 *   await streamlineCapture("board-table-dark", { theme: "dark" })
 *
 * The first capture also writes app.css: the app's whole stylesheet, so each
 * screen file stays small and they all share it. The theme option repaints the
 * page in that theme for the capture alone, then puts it back.
 */
window.streamlineCapture = async function streamlineCapture(name, options = {}) {
  const html = document.documentElement;
  const before = html.className;
  if (options.theme) {
    html.classList.remove("light", "dark", "dim");
    html.classList.add(options.theme === "light" ? "light" : "dark");
    if (options.theme === "dim") html.classList.add("dim");
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    let css = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
      } catch {
        // A stylesheet from another origin: nothing of ours.
      }
    }
    // next/font serves Inter from /_next; outside the app, Google Fonts does.
    css = css.replace(/@font-face\s*{[^}]*media\/[^}]*}/g, "");
    css += `\nhtml { --font-inter: "Inter", ui-sans-serif, system-ui, sans-serif !important; }\n`;

    const clone = html.cloneNode(true);
    clone.querySelectorAll("script, noscript, link[rel='stylesheet'], link[rel='preload'], link[as], style, nextjs-portal, next-route-announcer, [data-nextjs-toast], [data-sonner-toaster]").forEach((n) => n.remove());
    // Form fields keep what is typed in them.
    const live = html.querySelectorAll("input, textarea");
    clone.querySelectorAll("input, textarea").forEach((n, i) => {
      const value = live[i]?.value ?? "";
      if (n.tagName === "TEXTAREA") n.textContent = value;
      else n.setAttribute("value", value);
    });
    const assets = new Set();
    clone.querySelectorAll("img[src^='/'], image[href^='/']").forEach((n) => {
      const attr = n.tagName.toLowerCase() === "img" ? "src" : "href";
      const src = n.getAttribute(attr);
      if (!src || src.startsWith("/_next")) return;
      assets.add(src.split("?")[0]);
      n.setAttribute(attr, `assets/${src.split("?")[0].split("/").pop()}`);
    });
    const head = clone.querySelector("head");
    head.insertAdjacentHTML(
      "beforeend",
      '<meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="app.css">',
    );
    clone.querySelector("body")?.setAttribute("data-captured", new Date().toISOString());
    const page = `<!doctype html>\n${clone.outerHTML}`;
    const response = await fetch("/api/dev/figma-capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, html: page, css, assets: [...assets] }),
    });
    return (await response.json()).written;
  } finally {
    html.className = before;
  }
};
