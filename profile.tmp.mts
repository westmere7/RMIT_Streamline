/** Times the Departments tab and a portal after the changes. Temporary. */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
const { createClient } = await import("@supabase/supabase-js");
const { routeRepositoriesThrough } = await import("./src/data/supabase/client");
const { createSupabaseRepositories } = await import("./src/data/supabase");
const { createServices } = await import("./src/services");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
routeRepositoriesThrough(admin as never);
const repos = createSupabaseRepositories();
const services = createServices(repos);
const WS = (await repos.workspaces.list())[0]!.id;

async function time<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const out = await run();
  console.log(label.padEnd(40), String(Date.now() - t).padStart(6) + " ms");
  return out;
}

const overview = await time("portals.overview (Departments tab)", () => services.portals.overview(WS));
await time("portals.overview (again)", () => services.portals.overview(WS));
const contents = overview.find((r) => r.department.name === "Contents")!;
const portal = await services.portals.ensurePortal(WS, contents.department.id);
const resolved = { portal, department: contents.department, workspaceId: WS };
const payload = await time("portals.board (Contents)", () => services.portals.board(resolved as never));
console.log("  items:", payload.items.length, " values:", payload.values.length, " columns:", payload.columns.map((c) => c.name).join(", "));
console.log("  totals:", JSON.stringify({ ...payload.totals, byStatus: undefined, byPerson: payload.totals.byPerson.length, bySource: undefined }));
process.exit(0);
