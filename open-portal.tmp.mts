/** Opens one department's portal for local testing, and prints the token. */
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
const services = createServices(createSupabaseRepositories());
const WS = (await createSupabaseRepositories().workspaces.list())[0]!.id;
const departments = await services.portals.ensureDepartments(WS);
const target = departments.find((d) => d.name === process.argv[2]) ?? departments[0]!;
const portal = await services.portals.setEnabled(WS, target.id, true);
console.log(`${target.name}\t${portal.token}`);
process.exit(0);
