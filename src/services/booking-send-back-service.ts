import type { ActivityMetadata, Board, BoardColumn, BookingForm, BookingReceipt, BookingRequest, BookingSendBack, ColumnValue, EntityId, Item, User } from "@/domain";
import {
  ALREADY_WAITING,
  NOTHING_CHANGED,
  RESUBMIT_REPLY_MAX,
  RefusedError,
  SEND_BACK_NOTE_MAX,
  changedParts,
  isEmptyValue,
  isExpiredSendBack,
  isOpenSendBack,
  isSendBackToken,
  newSendBackToken,
  removedAssetLines,
  sameJson,
  sendBackExpiry,
  sendBackRefusal,
  serviceById,
  waitingLabelId,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { describeBooking, mapBookingToColumns } from "./booking";
import type { BookingService } from "./booking-service";
import type { CommentService } from "./comment-service";
import type { ItemAssetService } from "./item-asset-service";
import type { ItemService } from "./item-service";

/** What the requester's link opens: the form, their answers in it, and what the team asked for. */
export interface ResubmitForm {
  form: BookingForm;
  /** The booking as last sent, for the form to open with. Null for one booked before answers were kept. */
  prefill: BookingRequest | null;
  note: string;
  sentByName: string;
  sentAt: string;
  expiresAt: string;
  ticket: string | null;
  title: string;
}

/** Why a requester's link does not open, worded for them. */
export class SendBackLinkError extends RefusedError {
  constructor(
    message: string,
    readonly reason: "unknown" | "answered" | "cancelled" | "expired" | "gone",
  ) {
    super(message);
    this.name = "SendBackLinkError";
  }
}

/**
 * How send-backs reach the server on Supabase: the team's actions need the
 * service role (nobody's session writes booking_sendbacks), and the requester
 * has no session at all. Local mode needs none.
 */
export interface SendBackTransport {
  send(input: { itemId: EntityId; note: string }): Promise<BookingSendBack>;
  cancel(input: { itemId: EntityId }): Promise<void>;
  open(input: { token: string }): Promise<ResubmitForm>;
  resubmit(input: { token: string; request: BookingRequest; reply: string }): Promise<BookingReceipt>;
}

export class BookingSendBackService {
  constructor(
    private readonly repos: Repositories,
    private readonly booking: BookingService,
    private readonly items: ItemService,
    private readonly assets: ItemAssetService,
    private readonly comments: CommentService,
    private readonly transport: SendBackTransport | null,
  ) {}

  /** The one waiting on the requester, for the task's panel. Read directly: people who can edit the task may. */
  async openFor(itemId: EntityId): Promise<BookingSendBack | null> {
    return this.repos.bookingSendBacks.openFor(itemId);
  }

  /** The tasks among these that wait on their requester. */
  async openAmong(itemIds: readonly EntityId[]): Promise<Set<EntityId>> {
    if (itemIds.length === 0) return new Set();
    return new Set(await this.repos.bookingSendBacks.openItemIds(itemIds));
  }

  // ---- the team ------------------------------------------------------------

  /**
   * Sends a booked task back to its requester: the link is made, the task says
   * it is waiting (its board's "Waiting" status, when it has one), and the
   * task's activity and journey say what the team asked for. No update is
   * posted: the activity is the record.
   */
  async send(itemId: EntityId, rawNote: string, actorId: EntityId): Promise<BookingSendBack> {
    if (this.transport) return this.transport.send({ itemId, note: rawNote });
    const note = rawNote.trim();
    if (!note) throw new RefusedError("Say what the requester needs to add.");
    if (note.length > SEND_BACK_NOTE_MAX) throw new RefusedError(`Keep it under ${SEND_BACK_NOTE_MAX} characters.`);
    const { item, board, columns, status } = await this.taskOf(itemId);
    const refusal = sendBackRefusal(item, status.column, status.labelId);
    if (refusal) throw new RefusedError(refusal);
    if (await this.repos.bookingSendBacks.openFor(itemId)) throw new RefusedError(ALREADY_WAITING);

    const sendBack = await this.repos.bookingSendBacks.create({ workspaceId: board.workspaceId, itemId, note, token: newSendBackToken(), sentBy: actorId, expiresAt: sendBackExpiry() });
    const users = await this.repos.users.list();
    try {
      const who = await this.requesterName(item, columns, users);
      // On the task's activity and journey, with its own time: a task can go back and forth more than once.
      await this.log(item, board, actorId, "BOOKING_SENT_BACK", { requesterName: who === "the requester" ? undefined : who, summary: excerpt(note, 280) });
    } catch (error) {
      // Without the entry the task would never say it went back, or what was asked: undone.
      await this.repos.bookingSendBacks.update(sendBack.id, { cancelledAt: new Date().toISOString() }).catch(() => undefined);
      throw error;
    }
    const waiting = waitingLabelId(status.column);
    if (status.column && waiting && status.labelId !== waiting) {
      await this.setStatus(item, board, status.column, waiting, users, actorId).catch((error: unknown) => console.error("Could not mark the task waiting", error));
    }
    return sendBack;
  }

  /** Takes a send-back back before the requester answers: their link stops working. */
  async cancel(itemId: EntityId, actorId: EntityId): Promise<void> {
    if (this.transport) return this.transport.cancel({ itemId });
    const open = await this.repos.bookingSendBacks.openFor(itemId);
    if (!open) return;
    await this.repos.bookingSendBacks.update(open.id, { cancelledAt: new Date().toISOString() });
    const { item, board, status } = await this.taskOf(itemId);
    const users = await this.repos.users.list();
    await this.log(item, board, actorId, "BOOKING_SEND_BACK_CANCELLED", {}).catch((error: unknown) => console.error("Could not log the cancel", error));
    await this.restoreStatus(item, board, status, users, actorId);
  }

  // ---- the requester -------------------------------------------------------

  /** What the requester's link opens. */
  async open(token: string): Promise<ResubmitForm> {
    if (this.transport) return this.transport.open({ token });
    const { sendBack, item, board } = await this.answerable(token);
    const [form, stored, sender] = await Promise.all([this.booking.buildForm(board.workspaceId), this.repos.bookingRequests.get(item.id), this.repos.users.getById(sendBack.sentBy)]);
    let prefill: BookingRequest | null = null;
    if (stored) {
      const request = structuredClone(stored.request);
      // Today's form: a service it no longer offers is chosen again.
      if (request.serviceTypeId && !serviceById(form.template, request.serviceTypeId)) {
        request.serviceTypeId = null;
        request.subServices = [];
        request.answers = {};
      }
      request.formVersion = form.version ?? null;
      request.itemId = item.id;
      prefill = request;
    }
    return { form, prefill, note: sendBack.note, sentByName: sender?.displayName ?? "The team", sentAt: sendBack.sentAt, expiresAt: sendBack.expiresAt, ticket: item.ticket ?? null, title: item.name };
  }

  /**
   * The requester sends the form again. The same task takes what changed:
   * a value the form owns is rewritten only where their answer moved (so the
   * team's own changes since stay), the brief always, new asset lines are added
   * (lines they dropped stay for the team to remove), and an update says what
   * changed and mentions whoever sent it back.
   */
  async resubmit(token: string, raw: BookingRequest, rawReply: string): Promise<BookingReceipt> {
    if (this.transport) return this.transport.resubmit({ token, request: raw, reply: rawReply });
    const reply = rawReply.trim().slice(0, RESUBMIT_REPLY_MAX);
    const { sendBack, item, board } = await this.answerable(token);
    const workspaceId = board.workspaceId;
    const stored = await this.repos.bookingRequests.get(item.id);
    const before = stored?.request ?? null;
    // Who asked does not change: the link is theirs, not a new booking.
    const incoming: BookingRequest = { ...raw, itemId: item.id, requesterName: before?.requesterName ?? raw.requesterName, requesterEmail: before?.requesterEmail ?? raw.requesterEmail };
    const { request, template, team, department } = await this.booking.prepareRequest(workspaceId, incoming, null);
    // The same form sent straight back answers nothing. (A booking from before
    // answers were kept opens empty, so whatever comes back is new.)
    if (before && changedParts(before, request).length === 0) throw new RefusedError(NOTHING_CHANGED);

    // Claimed before anything is written: a second press, or a second tab, gets "already answered".
    const at = new Date().toISOString();
    if (!(await this.repos.bookingSendBacks.claimResubmission(sendBack.id, at))) throw new SendBackLinkError("This request has already been sent again.", "answered");
    try {
      const [columns, values, users, members, current] = await Promise.all([
        this.repos.boards.listColumns(board.id),
        this.repos.items.listValuesByItem(item.id),
        this.repos.users.list(),
        this.repos.workspaces.listMembers(workspaceId),
        this.repos.itemAssets.listByItem(item.id),
      ]);
      const requester = await this.booking.requesterOf(workspaceId, request.requesterEmail);
      const author = requester && members.some((m) => m.userId === requester.userId) ? requester.userId : null;
      // Value changes are the requester's when the workspace has them, else the person who sent it back.
      const actorId = author ?? sendBack.sentBy;
      const ctx = { team, template, stakeholder: department, requesterId: requester?.userId ?? null, teamOwnsBoard: !!team && board.teamId === team.id };
      const now = mapBookingToColumns(request, columns, ctx);
      const was = before ? mapBookingToColumns(before, columns, { ...ctx, stakeholder: before.department }) : null;
      const brief = columns.find((c) => c.type === "BRIEF") ?? columns.find((c) => c.type === "RICH_TEXT") ?? null;
      for (const placed of now.values) {
        const column = columns.find((c) => c.id === placed.columnId);
        if (!column) continue;
        const old = was?.values.find((v) => v.columnId === placed.columnId)?.value;
        // Without the booking as it was, only the brief is rewritten: anything else could be the team's.
        const moved = was ? !sameJson(old, placed.value) : column.id === brief?.id;
        if (!moved) continue;
        const existing = values.find((v) => v.columnId === column.id)?.value;
        if (existing && sameJson(existing, placed.value)) continue;
        await this.items.setValue(item.id, column.id, placed.value, { column, item, board, users }, actorId);
      }
      if (request.brief.trim()) await this.repos.items.setBookingBrief(item.id, request.brief);
      if (before && before.title.trim() !== request.title.trim()) await this.items.renameItem(item.id, request.title, actorId);
      // The description is rewritten only while it is still the one the booking wrote.
      if (before && was) {
        const oldDescription = describeBooking(before, was);
        const newDescription = describeBooking(request, now);
        if ((item.description ?? "") === oldDescription && oldDescription !== newDescription) await this.repos.items.update(item.id, { description: newDescription || null });
      }
      // New deliverables, by name, against what the task already has.
      const have = new Set(current.map((a) => a.name.trim().toLowerCase()));
      const assetType = request.assetTypes.length === 1 ? request.assetTypes[0]! : null;
      const adding = request.assets.filter((a) => !have.has(a.name.trim().toLowerCase()));
      if (adding.length) {
        await this.assets.addMany(
          adding.map((asset) => ({ itemId: item.id, boardId: board.id, name: asset.name, assetType: asset.assetType?.trim() || assetType, quantity: asset.quantity, dueDate: request.dueDate, notes: asset.spec?.trim() || null })),
          actorId,
        );
      }
      await this.repos.bookingRequests.put({ itemId: item.id, workspaceId, request: { ...request, itemId: item.id } });

      // What changed, said on the task: mentioning whoever sent it back reaches their inbox.
      const sender = users.find((u) => u.id === sendBack.sentBy) ?? null;
      const parts = before ? changedParts(before, request) : ["the whole form"];
      const dropped = before ? removedAssetLines(before, request) : [];
      const lines = [
        `${author ? "Sent" : `${request.requesterName || "The requester"} sent`} the request again with more information.${sender ? ` @${sender.displayName}` : ""}`,
        parts.length ? `Changed: ${parts.join(", ")}.` : "Nothing on the form changed.",
        ...(dropped.length ? [`No longer asked for (still on Assets): ${dropped.map((a) => a.name).join(", ")}.`] : []),
        ...(reply ? [reply] : []),
      ];
      await this.comments.addComment(item.id, lines.join("\n\n"), author ?? sendBack.sentBy, users);
      await this.log(item, board, author ?? sendBack.sentBy, "BOOKING_RESUBMITTED", { requesterName: request.requesterName || undefined, summary: before ? (parts.length ? `Changed ${parts.join(", ")}` : "Nothing changed") : undefined }).catch((error: unknown) => console.error("Could not log the answer", error));
      const status = statusOf(columns, values);
      await this.restoreStatus(item, board, status, users, actorId);
      const fresh = (await this.repos.items.getById(item.id)) ?? item;
      return { itemId: item.id, itemName: fresh.name, boardId: board.id, boardName: board.name, boardSlug: board.slug, teamName: null, ticket: fresh.ticket ?? "", submittedAt: at, assetCount: request.assets.length, taskLink: await this.booking.taskLinkFor(workspaceId, item.id) };
    } catch (error) {
      // Nothing half-sent stays claimed: the link works again for another try.
      await this.repos.bookingSendBacks.update(sendBack.id, { resubmittedAt: null }).catch(() => undefined);
      throw error;
    }
  }

  // ---- shared ----------------------------------------------------------------

  /** A link that can still be answered, with its task. */
  private async answerable(token: string): Promise<{ sendBack: BookingSendBack; item: Item; board: Board }> {
    const sendBack = isSendBackToken(token) ? await this.repos.bookingSendBacks.getByToken(token) : null;
    if (!sendBack) throw new SendBackLinkError("This link isn't valid. Check you have the whole address.", "unknown");
    if (sendBack.resubmittedAt) throw new SendBackLinkError("You've already sent this again. The team has it.", "answered");
    if (sendBack.cancelledAt) throw new SendBackLinkError("The team no longer needs anything here.", "cancelled");
    if (isExpiredSendBack(sendBack)) throw new SendBackLinkError("This link has expired. Ask the team for a new one.", "expired");
    const item = await this.repos.items.getById(sendBack.itemId);
    const board = item ? await this.repos.boards.getById(item.boardId) : null;
    if (!item || !board || item.archivedAt) throw new SendBackLinkError("This request is no longer open.", "gone");
    if (!isOpenSendBack(sendBack)) throw new SendBackLinkError("This link isn't valid.", "unknown");
    return { sendBack, item, board };
  }

  private async log(item: Item, board: Board, actorId: EntityId, eventType: "BOOKING_SENT_BACK" | "BOOKING_RESUBMITTED" | "BOOKING_SEND_BACK_CANCELLED", metadata: ActivityMetadata) {
    await this.repos.activities.create({ workspaceId: board.workspaceId, boardId: board.id, itemId: item.id, actorId, eventType, metadata: { itemName: item.name, ...metadata } });
  }

  private async taskOf(itemId: EntityId) {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const board = await this.repos.boards.getById(item.boardId);
    if (!board) throw new NotFoundError("Board", item.boardId);
    const [columns, values] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.items.listValuesByItem(item.id)]);
    return { item, board, columns, values, status: statusOf(columns, values) };
  }

  /** Back from "Waiting" to where a new request starts, unless the team has moved it on since. */
  private async restoreStatus(item: Item, board: Board, status: { column: BoardColumn | null; labelId: string | null }, users: readonly User[], actorId: EntityId) {
    const waiting = waitingLabelId(status.column);
    if (!status.column || status.column.settings.kind !== "status" || !waiting || status.labelId !== waiting) return;
    const back = status.column.settings.defaultLabelId;
    await this.setStatus(item, board, status.column, back, users, actorId).catch((error: unknown) => console.error("Could not move the task off Waiting", error));
  }

  private async setStatus(item: Item, board: Board, column: BoardColumn, labelId: string | null, users: readonly User[], actorId: EntityId) {
    const value: ColumnValue = { type: "STATUS", labelId };
    await this.items.setValue(item.id, column.id, value, { column, item, board, users }, actorId);
  }

  private async requesterName(item: Item, columns: readonly BoardColumn[], users: readonly User[]): Promise<string> {
    const stored = await this.repos.bookingRequests.get(item.id);
    if (stored?.request.requesterName.trim()) return stored.request.requesterName.trim();
    const values = await this.repos.items.listValuesByItem(item.id);
    for (const column of columns.filter((c) => c.type === "REQUESTER")) {
      const value = values.find((v) => v.columnId === column.id)?.value as { userIds?: string[] } | undefined;
      const person = value?.userIds?.[0] ? users.find((u) => u.id === value.userIds![0]) : null;
      if (person) return person.displayName;
    }
    return "the requester";
  }
}

function statusOf(columns: readonly BoardColumn[], values: ReadonlyArray<{ columnId: EntityId; value: ColumnValue }>): { column: BoardColumn | null; labelId: string | null } {
  const column = columns.find((c) => c.type === "STATUS") ?? null;
  const value = column ? values.find((v) => v.columnId === column.id)?.value : undefined;
  const labelId = value && !isEmptyValue(value) && value.type === "STATUS" ? value.labelId : column?.settings.kind === "status" ? column.settings.defaultLabelId : null;
  return { column, labelId };
}

/** A line's worth of a longer text. */
function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
