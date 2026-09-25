import type { Activity, ColorToken, EntityId } from "@/domain";

/**
 * A task's journey: its activity log cut down to the moments that matter.
 *
 * The log records everything — a rename, a person added, a tag — and read end
 * to end it answers "what happened" but not "how did this go". The journey
 * keeps only the milestones a manager would tell the story with: booked,
 * allocated, moved, status changes, deliverables landing, archived. Archiving
 * ends it; anything after that (short of a restore) is not part of the story.
 *
 * Pure, so the pop-up and the tests read the same thing.
 */

export type MilestoneKind =
  | "booked"
  | "created"
  | "allocated"
  | "moved"
  | "stage"
  | "status"
  | "done"
  | "assets-added"
  | "asset-done"
  | "assets-complete"
  | "asset-reopened"
  | "archived"
  | "restored";

export interface JourneyStatus {
  name: string;
  color: ColorToken | null;
  done: boolean;
}

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  at: string;
  actorId: EntityId;
  title: string;
  detail?: string;
  /** Status changes: where it came from and went to. */
  from?: JourneyStatus | null;
  to?: JourneyStatus | null;
  /** Deliverable milestones: how many were done out of how many at that moment. */
  progress?: { done: number; total: number };
  /** Milliseconds since the journey began. */
  sinceStart: number;
  /** Milliseconds since the milestone before, null for the first. */
  sincePrev: number | null;
}

export type PhaseKey = "queue" | "team" | "wrap";

export interface JourneyPhase {
  key: PhaseKey;
  label: string;
  start: string;
  end: string;
  ms: number;
  /** Still going: the journey has not left this phase. */
  open: boolean;
}

export interface Journey {
  milestones: Milestone[];
  start: string | null;
  /** When it was archived, or null while it is still going. */
  end: string | null;
  ongoing: boolean;
  totalMs: number;
  phases: JourneyPhase[];
  /** Time spent in each status, longest first. */
  inStatus: Array<JourneyStatus & { ms: number }>;
  current: JourneyStatus | null;
  booking: { requesterName: string | null; department: string | null; via: "booking" | "portal" } | null;
  statusChanges: number;
}

export interface JourneyContext {
  /** Status labels the task's board knows, to colour a name and tell whether it means done. */
  statuses: Array<{ name: string; color: ColorToken | null; done: boolean }>;
  /** The name of the allocation queue board, when the reader can see it. */
  queueBoardName?: string | null;
  /** "Now", for a journey still going. */
  now?: Date;
  /**
   * How many deliverables the task has now. A booking writes its lines with the
   * task and logs no "added" for them, so without this the journey counted from
   * nothing and every deliverable read "1 of 1 delivered".
   */
  assetCount?: number;
}

/** Deliverables added within this long of the task being created arrived with it. */
const WITH_CREATION_MS = 2 * 60_000;
/** Deliverables added within this long of each other are one milestone. */
const BATCH_MS = 10 * 60_000;
const DONE_WORDS = /^(done|complete|completed|delivered|finished|approved|closed)$/i;

export function buildJourney(activities: readonly Activity[], ctx: JourneyContext): Journey {
  const now = (ctx.now ?? new Date()).getTime();
  const events = [...activities].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const statusOf = (name: string | null | undefined): JourneyStatus | null => {
    if (!name) return null;
    const known = ctx.statuses.find((s) => s.name.toLowerCase() === name.toLowerCase());
    return { name, color: known?.color ?? null, done: known ? known.done : DONE_WORDS.test(name.trim()) };
  };

  const raw: Array<Omit<Milestone, "sinceStart" | "sincePrev">> = [];
  let createdAt: number | null = null;
  let createdBoard: string | null = null;
  let booking: Journey["booking"] = null;
  let ended = false;
  let total = 0;
  let done = 0;
  let batch: (Omit<Milestone, "sinceStart" | "sincePrev"> & { count: number }) | null = null;
  // Deliverables ticked off one after another are one step, as adding them is.
  let doneBatch: (Omit<Milestone, "sinceStart" | "sincePrev"> & { count: number; names: string[]; actor: string | null }) | null = null;
  // The lines the task has had from the start, with no "added" of their own.
  const added = events.filter((e) => e.eventType === "ASSET_ADDED").length;
  const removed = events.filter((e) => e.eventType === "ASSET_REMOVED").length;
  total = Math.max(0, (ctx.assetCount ?? 0) - added + removed);
  let arrivedWith = total;

  for (const event of events) {
    const at = new Date(event.createdAt).getTime();
    const meta = event.metadata ?? {};
    if (ended && event.eventType !== "ITEM_RESTORED") continue;
    if (event.eventType !== "ASSET_ADDED") batch = null;
    if (event.eventType !== "ASSET_COMPLETED") doneBatch = null;

    switch (event.eventType) {
      case "ITEM_CREATED": {
        if (createdAt !== null) break;
        createdAt = at;
        createdBoard = meta.boardName ?? null;
        const booked = meta.via === "booking" || meta.via === "portal" || (!!ctx.queueBoardName && createdBoard === ctx.queueBoardName) || /task allocation/i.test(createdBoard ?? "");
        if (booked) booking = { requesterName: meta.requesterName ?? null, department: meta.department ?? null, via: meta.via === "portal" ? "portal" : "booking" };
        raw.push({
          id: event.id,
          kind: booked ? "booked" : "created",
          at: event.createdAt,
          actorId: event.actorId,
          title: booked ? (meta.via === "portal" ? "Booked through the portal" : "Booked") : `Created on ${createdBoard ?? "the board"}`,
          detail: booked ? [meta.requesterName ? `by ${meta.requesterName}` : null, meta.department ? `for ${meta.department}` : null, createdBoard ? `into ${createdBoard}` : null].filter(Boolean).join(" · ") || undefined : meta.groupName ? `in ${meta.groupName}` : undefined,
        });
        break;
      }
      case "ITEM_MOVED": {
        if (meta.from && meta.to) {
          const fromQueue = (!!ctx.queueBoardName && meta.from === ctx.queueBoardName) || /task allocation/i.test(meta.from) || (booking !== null && meta.from === createdBoard && !raw.some((m) => m.kind === "allocated"));
          raw.push({ id: event.id, kind: fromQueue ? "allocated" : "moved", at: event.createdAt, actorId: event.actorId, title: fromQueue ? `Allocated to ${meta.to}` : `Moved to ${meta.to}`, detail: `from ${meta.from}` });
        } else if (meta.toGroupName) {
          raw.push({ id: event.id, kind: "stage", at: event.createdAt, actorId: event.actorId, title: `Moved to ${meta.toGroupName}`, detail: meta.fromGroupName ? `from ${meta.fromGroupName}` : undefined });
        }
        break;
      }
      case "ITEM_COLUMN_VALUE_UPDATED": {
        if (meta.columnType !== "STATUS") break;
        const from = statusOf(meta.from);
        const to = statusOf(meta.to);
        if (!to && !from) break;
        raw.push({ id: event.id, kind: to?.done ? "done" : "status", at: event.createdAt, actorId: event.actorId, title: to ? (to.done ? `Marked ${to.name}` : `Status: ${to.name}`) : "Status cleared", from, to });
        break;
      }
      case "ASSET_ADDED": {
        total += 1;
        if (createdAt !== null && at - createdAt <= WITH_CREATION_MS) {
          // Arrived with the task: part of the booking, not a milestone of its own.
          arrivedWith += 1;
          break;
        }
        if (batch && at - new Date(batch.at).getTime() <= BATCH_MS) {
          batch.count += 1;
          batch.title = `${batch.count} deliverables added`;
          batch.detail = undefined;
          batch.progress = { done, total };
          break;
        }
        batch = { id: event.id, kind: "assets-added", at: event.createdAt, actorId: event.actorId, title: "Deliverable added", detail: meta.assetName, progress: { done, total }, count: 1 };
        raw.push(batch);
        break;
      }
      case "ASSET_REMOVED":
        total = Math.max(0, total - 1);
        break;
      case "ASSET_COMPLETED": {
        done = Math.min(total || done + 1, done + 1);
        const all = total > 0 && done >= total;
        const progress = { done, total: Math.max(total, done) };
        const name = meta.assetName ?? null;
        if (doneBatch && doneBatch.actor === event.actorId && at - new Date(doneBatch.at).getTime() <= BATCH_MS) {
          doneBatch.count += 1;
          if (name) doneBatch.names.push(name);
          doneBatch.kind = all ? "assets-complete" : "asset-done";
          doneBatch.title = all ? `All ${progress.total} deliverables done` : `${doneBatch.count} deliverables done`;
          doneBatch.detail = listNames(doneBatch.names);
          doneBatch.progress = progress;
          break;
        }
        doneBatch = {
          id: event.id,
          kind: all ? "assets-complete" : "asset-done",
          at: event.createdAt,
          actorId: event.actorId,
          title: all && progress.total > 1 ? `All ${progress.total} deliverables done` : "Deliverable done",
          detail: name ?? undefined,
          progress,
          count: 1,
          names: name ? [name] : [],
          actor: event.actorId,
        };
        raw.push(doneBatch);
        break;
      }
      case "ASSET_REOPENED": {
        done = Math.max(0, done - 1);
        raw.push({ id: event.id, kind: "asset-reopened", at: event.createdAt, actorId: event.actorId, title: "Deliverable reopened", detail: meta.assetName, progress: { done, total } });
        break;
      }
      case "ITEM_ARCHIVED":
        raw.push({ id: event.id, kind: "archived", at: event.createdAt, actorId: event.actorId, title: "Archived", detail: meta.boardName ? `from ${meta.boardName}` : undefined });
        ended = true;
        break;
      case "ITEM_RESTORED":
        if (!ended) break;
        raw.push({ id: event.id, kind: "restored", at: event.createdAt, actorId: event.actorId, title: "Restored", detail: meta.boardName ? `to ${meta.boardName}` : undefined });
        ended = false;
        break;
    }
  }

  const first = raw[0];
  if (first && arrivedWith > 0 && (first.kind === "booked" || first.kind === "created")) {
    first.detail = [first.detail, `${arrivedWith} ${arrivedWith === 1 ? "deliverable" : "deliverables"}`].filter(Boolean).join(" · ");
    first.progress = { done: 0, total: arrivedWith };
  }

  const start = raw[0]?.at ?? null;
  const startMs = start ? new Date(start).getTime() : now;
  const end = ended ? raw[raw.length - 1]!.at : null;
  const endMs = end ? new Date(end).getTime() : now;
  const milestones: Milestone[] = raw.map((m, i) => ({
    ...m,
    sinceStart: new Date(m.at).getTime() - startMs,
    sincePrev: i === 0 ? null : new Date(m.at).getTime() - new Date(raw[i - 1]!.at).getTime(),
  }));

  // ---- time in each status ---------------------------------------------------
  const spent = new Map<string, JourneyStatus & { ms: number }>();
  let current: JourneyStatus | null = null;
  let since = startMs;
  const accrue = (status: JourneyStatus | null, until: number) => {
    if (!status) return;
    const key = status.name.toLowerCase();
    const entry = spent.get(key) ?? { ...status, ms: 0 };
    entry.ms += Math.max(0, until - since);
    spent.set(key, entry);
  };
  for (const m of milestones) {
    if (m.kind !== "status" && m.kind !== "done") continue;
    const at = new Date(m.at).getTime();
    accrue(current ?? m.from ?? null, at);
    current = m.to ?? null;
    since = at;
  }
  accrue(current, endMs);

  // ---- phases ------------------------------------------------------------------
  const phases: JourneyPhase[] = [];
  if (start) {
    const allocated = milestones.find((m) => m.kind === "allocated");
    const teamStart = allocated ? allocated.at : start;
    if (allocated) phases.push({ key: "queue", label: "In the queue", start, end: allocated.at, ms: new Date(allocated.at).getTime() - startMs, open: false });
    else if (booking && !milestones.some((m) => m.kind === "moved")) {
      // Booked and never placed: still waiting in the queue, unless it went straight to a team board.
      const queued = /task allocation/i.test(createdBoard ?? "") || (!!ctx.queueBoardName && createdBoard === ctx.queueBoardName);
      if (queued) phases.push({ key: "queue", label: "In the queue", start, end: end ?? new Date(now).toISOString(), ms: endMs - startMs, open: !end });
    }
    if (!phases.some((p) => p.open)) {
      // Done is the last time it became done and stayed there.
      const finished = current?.done ? [...milestones].reverse().find((m) => m.kind === "done") : undefined;
      const teamEnd = finished ? finished.at : (end ?? new Date(now).toISOString());
      phases.push({ key: "team", label: "With the team", start: teamStart, end: teamEnd, ms: Math.max(0, new Date(teamEnd).getTime() - new Date(teamStart).getTime()), open: !finished && !end });
      if (finished) {
        const wrapEnd = end ?? new Date(now).toISOString();
        phases.push({ key: "wrap", label: end ? "Done to archive" : "Done, not archived", start: finished.at, end: wrapEnd, ms: Math.max(0, new Date(wrapEnd).getTime() - new Date(finished.at).getTime()), open: !end });
      }
    }
  }

  return {
    milestones,
    start,
    end,
    ongoing: !ended,
    totalMs: start ? endMs - startMs : 0,
    phases,
    inStatus: [...spent.values()].filter((s) => s.ms > 0).sort((a, b) => b.ms - a.ms),
    current,
    booking,
    statusChanges: milestones.filter((m) => m.kind === "status" || m.kind === "done").length,
  };
}

/** "Hero, Banner and Poster", or the first three and how many more. */
function listNames(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.length <= 3) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** "45s", "12m", "3h 20m", "2d 4h", "3w 2d": two units at most, the larger first. */
export function formatSpan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
  const w = Math.floor(d / 7);
  return d % 7 ? `${w}w ${d % 7}d` : `${w}w`;
}
