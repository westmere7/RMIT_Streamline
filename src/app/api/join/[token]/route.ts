import { handleRoute, json, readJson } from "@/server/http";
import { completeOnboarding, completeSchema, previewInvitation } from "@/server/onboarding";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** What the join page shows for a link. Needs no session: the token is the credential. */
export const GET = handleRoute(async (_request: Request, context: Context) => {
  const { token } = await context.params;
  return json(await previewInvitation(token));
});

/** Sets the password and profile for the invited person and activates their membership. */
export const POST = handleRoute(async (request: Request, context: Context) => {
  const { token } = await context.params;
  const input = completeSchema.parse(await readJson(request));
  return json(await completeOnboarding(token, input));
});
