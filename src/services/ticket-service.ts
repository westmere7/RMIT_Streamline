import type { EntityId, Item, Workspace } from "@/domain";
import { formatTicket, normaliseTicket, normaliseTicketPrefix, parseTicket, ticketPrefixOf } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { ItemLinkService } from "./item-link-service";

/**
 * Why a ticket was refused, in words the person who typed it can act on.
 *
 * Thrown rather than returned because every caller has the same answer to it —
 * say so and change nothing — and a ticket quietly dropped is exactly the
 * failure this service exists to prevent.
 */
export class TicketError extends Error {
  constructor(
    message: string,
    /** The task already holding the ticket, when that is what went wrong. */
    readonly heldBy?: Item,
  ) {
    super(message);
    this.name = "TicketError";
  }
}

/** What changing a workspace's prefix did. */
export interface PrefixChange {
  prefix: string;
  /** How many tasks were given the new prefix. Zero when the tickets already out were left alone. */
  rewritten: number;
}

/**
 * Who hands out tickets, and the only thing that may.
 *
 * Two rules, and everything here is one of them:
 *
 *   * a ticket is taken from the workspace's counter in one atomic step, so two
 *     bookings landing in the same second cannot be given the same number;
 *   * no two tasks hold the same ticket — except tasks linked to each other
 *     across a link that carries the ticket, which are one piece of work seen
 *     from several boards and are meant to answer to one code.
 *
 * The second rule cannot be a unique index, because the exception is a question
 * about the link graph. It is asked here instead, on every path that can put a
 * ticket on a task.
 */
export class TicketService {
  constructor(
    private readonly repos: Repositories,
    private readonly links: ItemLinkService,
  ) {}

  /** What this workspace stamps on its tickets. */
  async prefixOf(workspaceId: EntityId): Promise<string> {
    return ticketPrefixOf((await this.workspace(workspaceId)).ticketPrefix);
  }

  /**
   * The next ticket, taken from the counter.
   *
   * Taking is the commitment: the number is spent whether or not what it was
   * taken for goes on to be written. A booking that fails halfway leaves a gap
   * in the series, which is the right trade — a gap is a curiosity, a repeat is
   * two people quoting one code at each other.
   */
  async issue(workspaceId: EntityId): Promise<string> {
    return (await this.issueMany(workspaceId, 1))[0]!;
  }

  /** The next `count` tickets, in order, from one bump of the counter. */
  async issueMany(workspaceId: EntityId, count: number): Promise<string[]> {
    if (count < 1) return [];
    const workspace = await this.workspace(workspaceId);
    const first = await this.repos.workspaces.allocateTicketNumbers(workspaceId, count);
    const prefix = ticketPrefixOf(workspace.ticketPrefix);
    return Array.from({ length: count }, (_, i) => formatTicket(prefix, first + i));
  }

  /**
   * Gives a task the next ticket in the series.
   *
   * For work that arrived some other way than the booking form — added straight
   * to a board, carried over from a spreadsheet — and now needs something a
   * stakeholder can quote. A task that already holds one keeps it: asking twice
   * should not burn a number.
   */
  async assign(workspaceId: EntityId, itemId: EntityId, actorId: EntityId): Promise<Item> {
    const item = await this.item(itemId);
    if (item.ticket) return item;
    return this.write(itemId, await this.issue(workspaceId), actorId);
  }

  /**
   * Puts a particular ticket on a task, or takes its ticket away.
   *
   * The hand-typed path: a code quoted wrongly in an email, or a task that
   * should answer to the one its predecessor had. It is checked against the
   * rest of the workspace and refused rather than quietly duplicated.
   *
   * It does not touch the counter. A ticket typed in above the series does not
   * drag it along; the next booking takes the number after the one the counter
   * is on, and runs into this one only if they collide — which is what the
   * check is for.
   */
  async setTicket(workspaceId: EntityId, itemId: EntityId, value: string | null, actorId: EntityId): Promise<Item> {
    const raw = (value ?? "").trim();
    if (raw.length === 0) return this.write(itemId, null, actorId);

    const ticket = normaliseTicket(raw);
    if (!ticket) throw new TicketError(`"${raw}" is not a ticket. They look like ${formatTicket(await this.prefixOf(workspaceId), 14)}.`);

    const held = await this.heldBy(workspaceId, itemId, ticket);
    if (held) throw new TicketError(`${ticket} is already ${held.name}.`, held);
    return this.write(itemId, ticket, actorId);
  }

  /**
   * The task already holding this ticket, if it is not one this task may share
   * it with.
   *
   * Null means the ticket is free. A caller that only wants to know — a field
   * checking as somebody types — can ask without writing anything.
   */
  async heldBy(workspaceId: EntityId, itemId: EntityId, ticket: string): Promise<Item | null> {
    const boardIds = await this.boardIds(workspaceId);
    const holders = await this.repos.items.listByTicket(boardIds, ticket);
    if (holders.length === 0) return null;
    const entitled = new Set([itemId, ...(await this.links.ticketChainIds(itemId))]);
    return holders.find((holder) => !entitled.has(holder.id)) ?? null;
  }

  /**
   * Changes what this workspace stamps on new tickets, and optionally rewrites
   * the ones already handed out.
   *
   * Rewriting is a decision about codes sitting in other people's inboxes, so
   * it is asked for rather than assumed. Either way the numbers are untouched:
   * the number is what people count by, and CP_014 becoming PROD_014 is still
   * recognisably the fourteenth thing that came in.
   *
   * The tickets are rewritten before the workspace is told its new prefix, and
   * both steps are one write each. If the rewrite fails nothing has moved and
   * the workspace is still stamping the prefix its tickets actually carry —
   * the state to avoid here is half the tickets renamed with no record of which.
   */
  async setPrefix(workspaceId: EntityId, prefix: string, options: { rewriteExisting: boolean }): Promise<PrefixChange> {
    const next = normaliseTicketPrefix(prefix);
    if (!next) throw new TicketError("A ticket prefix is one to eight letters or digits — “CP”, say.");

    const current = await this.prefixOf(workspaceId);
    // Every ticket keeps the number it had, so nothing can collide that was not
    // colliding already, and two tasks sharing a ticket across a link move
    // together because both are rewritten by the same rule.
    const rewritten = options.rewriteExisting && next !== current ? await this.repos.items.rewriteTicketPrefix(await this.boardIds(workspaceId), next) : 0;
    await this.repos.workspaces.update(workspaceId, { ticketPrefix: next });
    return { prefix: next, rewritten };
  }

  /** How many tasks in the workspace hold a ticket, for the sentence before a prefix change. */
  async countTicketed(workspaceId: EntityId): Promise<number> {
    return this.repos.items.countTicketed(await this.boardIds(workspaceId));
  }

  /**
   * Pulls the counter up past any ticket it does not know about.
   *
   * Only ever true of data that arrived some other way — a restore, an import,
   * a code typed in above the series — and cheap insurance against handing out
   * a number that is already in use. Returns how far it moved.
   */
  async reconcileCounter(workspaceId: EntityId): Promise<number> {
    const workspace = await this.workspace(workspaceId);
    const highest = (await this.ticketed(workspaceId)).reduce((max, item) => Math.max(max, parseTicket(item.ticket)?.number ?? 0), 0);
    const behind = highest - (workspace.ticketCounter ?? 0);
    if (behind <= 0) return 0;
    await this.repos.workspaces.allocateTicketNumbers(workspaceId, behind);
    return behind;
  }

  // ---- Helpers ---------------------------------------------------------------

  private async write(itemId: EntityId, ticket: string | null, actorId: EntityId): Promise<Item> {
    const item = await this.repos.items.update(itemId, { ticket });
    await this.links.propagate(itemId, { kind: "ticket", ticket }, actorId);
    return item;
  }

  private async ticketed(workspaceId: EntityId): Promise<Item[]> {
    return this.repos.items.listTicketed(await this.boardIds(workspaceId));
  }

  private async boardIds(workspaceId: EntityId): Promise<EntityId[]> {
    return (await this.repos.boards.listByWorkspace(workspaceId)).map((board) => board.id);
  }

  private async workspace(workspaceId: EntityId): Promise<Workspace> {
    const workspace = await this.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new NotFoundError("Workspace", workspaceId);
    return workspace;
  }

  private async item(itemId: EntityId): Promise<Item> {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    return item;
  }
}
