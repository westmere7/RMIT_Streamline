import type { Board, EntityId, Item, Team, User } from "@/domain";
import type { Repositories } from "@/data/repositories";

export interface SearchResults {
  boards: Board[];
  /** `archived` items are in a board's archive; they are only searched when asked for. */
  items: Array<{ item: Item; board: Board; archived: boolean }>;
  teams: Team[];
  users: User[];
}

export interface SearchOptions {
  limitPerGroup?: number;
  /**
   * Search the boards' archives as well.
   *
   * Off unless asked for: the archive is where finished work goes, so it is
   * noise in the answer to "where is the thing I am working on" - and it is a
   * second read of every board.
   */
  includeArchived?: boolean;
}

function matches(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

/**
 * A booking code, matched the way people quote it: "TA-4F2K", "ta4f2k", or the
 * tail of it. The hyphen is dropped from both sides because nobody remembers
 * whether the code has one.
 */
function matchesReference(reference: string | null | undefined, needle: string): boolean {
  if (!reference) return false;
  const loose = (value: string) => value.toLowerCase().replace(/[\s-]/g, "");
  return reference.toLowerCase().includes(needle) || loose(reference).includes(loose(needle));
}

export class SearchService {
  constructor(private readonly repos: Repositories) {}

  async search(workspaceId: EntityId, query: string, options: SearchOptions = {}): Promise<SearchResults> {
    const limitPerGroup = options.limitPerGroup ?? 6;
    const needle = query.trim().toLowerCase();
    if (!needle) return { boards: [], items: [], teams: [], users: [] };

    const [boards, teams, users, members] = await Promise.all([
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.users.list(),
      this.repos.workspaces.listMembers(workspaceId),
    ]);
    // Pending and deactivated people are not searchable: you cannot assign or message them yet.
    const memberIds = new Set(members.filter((m) => m.status === "ACTIVE").map((m) => m.userId));
    const activeBoards = boards.filter((b) => b.archivedAt === null);

    const itemMatches: SearchResults["items"] = [];
    for (const board of activeBoards) {
      if (itemMatches.length >= limitPerGroup * 2) break;
      const items = await this.repos.items.listByBoard(board.id, { includeArchived: options.includeArchived });
      for (const item of items) {
        if (matches(item.name, needle) || matchesReference(item.reference, needle)) itemMatches.push({ item, board, archived: item.archivedAt !== null });
      }
    }
    // Live work first: an archived hit is a different answer to the question,
    // and it should not push the thing someone is working on off the list.
    itemMatches.sort((a, b) => Number(a.archived) - Number(b.archived));

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
