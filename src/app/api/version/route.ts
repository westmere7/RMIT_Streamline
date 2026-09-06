import { handleRoute, json } from "@/server/http";
import { CURRENT_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Which build the server is running. The values are baked in at build time
 * (next.config.ts), so after a deployment this answers with the new build
 * while pages opened before it still carry the old one.
 */
export const GET = handleRoute(async () => json(CURRENT_VERSION));
