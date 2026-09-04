import type { Board, EntityId, Item, Team, User } from "@/domain";
import type { Repositories } from "@/data/repositories";

export interface SearchResults {
  boards: Board[];
  items: Array<{ item: Item; board: Board }>;
  teams: Team[];
  users: User[];
}

function matches(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

export class SearchService {
  constructor(private readonly repos: Repositories) {}

  async search(workspaceId: EntityId, query: string, limitPerGroup = 6): Promise<SearchResults> {
    const needle = query.trim().toLowerCase();
    if (!needle) return { boards: [], items: [], teams: [], users: [] };

    const [boards, teams, users, members] = await Promise.all([
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.users.list(),
      this.repos.workspaces.listMembers(workspaceId),
    ]);
    const memberIds = new Set(members.map((m) => m.userId));
    const activeBoards = boards.filter((b) => b.archivedAt === null);

    const itemMatches: Array<{ item: Item; board: Board }> = [];
    for (const board of activeBoards) {
      if (itemMatches.length >= limitPerGroup * 2) break;
      const items = await this.repos.items.listByBoard(board.id);
      for (const item of items) {
        if (matches(item.name, needle)) itemMatches.push({ item, board });
      }
    }

    return {
      boards: activeBoards.filter((b) => matches(b.name, needle) || matches(b.description, needle)).slice(0, limitPerGroup),
      items: itemMatches.slice(0, limitPerGroup * 2),
      teams: teams.filter((t) => t.archivedAt === null && matches(t.name, needle)).slice(0, limitPerGroup),
      users: users
        .filter((u) => memberIds.has(u.id) && !u.deactivatedAt)
        .filter((u) => matches(u.displayName, needle) || matches(u.email, needle) || matches(u.jobTitle, needle))
        .slice(0, limitPerGroup),
    };
  }
}
