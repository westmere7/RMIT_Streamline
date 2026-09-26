import { handleRoute, json, readJson } from "@/server/http";
import { previewSelfJoin, selfJoin, selfJoinSchema } from "@/server/self-join";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ key: string }> };

/** Whether the workspace's join link works, and which workspace it is for. Needs no session. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { key } = await params;
  return json(await previewSelfJoin(decodeURIComponent(key)));
});

/** Adds the person who typed their details as a pending member and returns their personal link's token. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { key } = await params;
  const body = selfJoinSchema.parse(await readJson(request));
  return json(await selfJoin(decodeURIComponent(key), body), 201);
});
