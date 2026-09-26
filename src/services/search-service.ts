import type { Board, EntityId, Item, Team, User } from "@/domain";
import { parseTicket, ticketSearchKey } from "@/domain";
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
  /**
   * Look for items on this board only.
   *
   * The palette's "search in this board". Filtering the workspace's results
   * afterwards lost most of them: the workspace answer was capped first, so
   * another board's matches could fill it and leave this board's out.
   */
  boardId?: EntityId | null;
}

/**
 * Text as it is compared: lower case, accents off, "đ" as "d".
 *
 * Half the names in this workspace are Vietnamese, and nobody types the
 * diacritics into a search box.
 */
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

/** A folded query, and the words in it. */
interface Needle {
  phrase: string;
  words: string[];
}

function needleOf(query: string): Needle {
  const phrase = foldForSearch(query.trim()).replace(/\s+/g, " ");
  return { phrase, words: phrase.split(" ").filter(Boolean) };
}

/**
 * How well a piece of text answers the query, lower being better, or null for
 * not at all.
 *
 * Every word typed has to be in the text somewhere, in any order: "grad day"
 * is "Graduation day", and "grad" alone is too. Then the ranking is what a
 * person expects: the whole thing, then something that starts with what they
 * typed, then one whose words start with what they typed, then anything that
 * merely contains it.
 */
export function searchScore(text: string | null | undefined, needle: Needle): number | null {
  if (!text || needle.words.length === 0) return null;
  const hay = foldForSearch(text);
  if (!needle.words.every((word) => hay.includes(word))) return null;
  if (hay === needle.phrase) return 0;
  if (hay.startsWith(needle.phrase)) return 1;
  const tokens = hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (needle.words.every((word) => tokens.some((token) => token.startsWith(word)))) return 2;
  return 3;
}

/** The better of several scores, where null is no match. */
function best(...scores: Array<number | null>): number | null {
  const found = scores.filter((s): s is number => s !== null);
  return found.length ? Math.min(...found) : null;
}

/**
 * How well a ticket answers what was typed, on the ranking's own scale.
 *
 * Quoted the way people quote one — "CP_014", "cp14", "cp-14", or its bare
 * number, "14" or "014" — the ticket is as good as the name: 0. Appearing
 * somewhere inside it is a weak match, like a name that merely contains the
 * text: 3. A query with no digit in it is never a ticket at all. Every task
 * has one, so letting "c" or "cp" match them filled the results with every
 * ticketed task and buried the names being typed.
 */
function ticketScore(ticket: string | null | undefined, query: string): number | null {
  if (!ticket) return null;
  const needle = query.trim().toLowerCase();
  if (!/\d/.test(needle)) return null;
  const key = ticketSearchKey(needle);
  if (ticketSearchKey(ticket) === key) return 0;
  if (/^\d+$/.test(needle) && parseTicket(ticket)?.number === Number(needle)) return 0;
  return ticket.toLowerCase().includes(needle) || ticketSearchKey(ticket).includes(key) ? 3 : null;
}

/** Best first, then the shorter name, which is nearer to being what was typed. */
function ranked<T>(rows: Array<{ row: T; score: number; name: string }>, limit: number): T[] {
  return rows
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.row);
}

export class SearchService {
  constructor(private readonly repos: Repositories) {}

  async search(workspaceId: EntityId, query: string, options: SearchOptions = {}): Promise<SearchResults> {
    const limitPerGroup = options.limitPerGroup ?? 6;
    const needle = needleOf(query);
    if (needle.words.length === 0) return { boards: [], items: [], teams: [], users: [] };

    const [boards, teams, users, members] = await Promise.all([
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.users.list(),
      this.repos.workspaces.listMembers(workspaceId),
    ]);
    // Pending people are found too (a requester a booking added, say); deactivated ones are not.
    const memberIds = new Set(members.filter((m) => m.status !== "DEACTIVATED").map((m) => m.userId));
    const activeBoards = boards.filter((b) => b.archivedAt === null);
    const itemBoards = options.boardId ? activeBoards.filter((b) => b.id === options.boardId) : activeBoards;

    // Every board, read at once, and every match ranked before any is cut. It
    // used to stop at the first dozen matches in board order, so the task that
    // matched best could be the one left out.
    const perBoard = await Promise.all(itemBoards.map(async (board) => ({ board, items: await this.repos.items.listByBoard(board.id, { includeArchived: options.includeArchived }) })));
    const itemRows: Array<{ row: SearchResults["items"][number]; score: number; name: string }> = [];
    for (const { board, items } of perBoard) {
      for (const item of items) {
        // A ticket quoted in full is as good as the name itself: whoever typed
        // it was quoting this task.
        const score = best(searchScore(item.name, needle), ticketScore(item.ticket, query));
        if (score === null) continue;
        const archived = item.archivedAt !== null;
        // Live work ahead of archived work at the same score: an archived hit is
        // a different answer to the question.
        itemRows.push({ row: { item, board, archived }, score: score + (archived ? 0.5 : 0), name: item.name });
      }
    }

    const boardRows = activeBoards.flatMap((board) => {
      const score = best(searchScore(board.name, needle), searchScore(board.description, needle) === null ? null : 4);
      return score === null ? [] : [{ row: board, score, name: board.name }];
    });
    const teamRows = teams.flatMap((team) => {
      const score = team.archivedAt === null ? searchScore(team.name, needle) : null;
      return score === null ? [] : [{ row: team, score, name: team.name }];
    });
    const userRows = users
      .filter((u) => memberIds.has(u.id) && !u.deactivatedAt)
      .flatMap((user) => {
        // The name first; an email or a job title that matches is a weaker answer.
        const byName = searchScore(user.displayName, needle);
        const other = best(searchScore(user.email, needle), searchScore(user.jobTitle, needle));
        const score = best(byName, other === null ? null : other + 3);
        return score === null ? [] : [{ row: user, score, name: user.displayName }];
      });

    return {
      boards: ranked(boardRows, limitPerGroup),
      items: ranked(itemRows, limitPerGroup * 2),
      teams: ranked(teamRows, limitPerGroup),
      users: ranked(userRows, limitPerGroup),
    };
  }
}
