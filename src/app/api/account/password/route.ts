import { changeOwnPassword, changePasswordSchema } from "@/server/account";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** The signed-in person changes their own password, giving the current one. */
export const POST = handleRoute(async (request: Request) => {
  const input = changePasswordSchema.parse(await readJson(request));
  return json(await changeOwnPassword(request, input));
});
