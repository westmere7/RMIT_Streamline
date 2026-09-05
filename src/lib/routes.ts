import type { BoardViewKind } from "@/domain";

export const routes = {
  root: () => "/",
  login: () => "/login",
  workspace: (slug: string) => `/workspace/${slug}`,
  myWork: (slug: string) => `/workspace/${slug}/my-work`,
  inbox: (slug: string) => `/workspace/${slug}/inbox`,
  members: (slug: string) => `/workspace/${slug}/members`,
  person: (slug: string, userId: string) => `/workspace/${slug}/people/${userId}`,
  messages: (slug: string, withUserId?: string | null) => `/workspace/${slug}/messages${withUserId ? `?to=${withUserId}` : ""}`,
  settings: (slug: string, section?: string) => `/workspace/${slug}/settings${section ? `?section=${section}` : ""}`,
  team: (slug: string, teamId: string) => `/workspace/${slug}/teams/${teamId}`,
  trackers: (slug: string) => `/workspace/${slug}/trackers`,
  tracker: (slug: string, trackerId: string, sheetId?: string | null) => `/workspace/${slug}/trackers/${trackerId}${sheetId ? `?sheet=${sheetId}` : ""}`,
  board: (slug: string, boardSlug: string, options?: { view?: BoardViewKind; itemId?: string | null }) => {
    const params = new URLSearchParams();
    if (options?.view && options.view !== "table") params.set("view", options.view);
    if (options?.itemId) params.set("item", options.itemId);
    const query = params.toString();
    return `/workspace/${slug}/boards/${boardSlug}${query ? `?${query}` : ""}`;
  },
};
