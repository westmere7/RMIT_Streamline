import type { Activity, ActivityInput, EntityId, NotificationInput, Subscription, SubscriptionEvent, SubscriptionTarget } from "@/domain";
import { subscriptionEventFor, subscriptionMessage } from "@/domain";
import type { Repositories } from "@/data/repositories";
import type { NotificationService } from "./notification-service";

/**
 * Following boards and tasks, and telling followers what changed.
 *
 * Every change the app makes is written to the activity feed, so that is where
 * followers are told from: `withFollowers` wraps the activity repository, and
 * each batch of entries it writes is handed to `fanOut` without holding up the
 * edit that wrote it. A follower hears about the kinds of change they chose,
 * never about their own, and a burst of changes to one task reaches them as
 * one notification rather than one each. The notification is a quiet update by
 * default ("Things I follow" in notification settings), and a board they muted
 * stays muted.
 */
export class SubscriptionService {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly repos: Repositories,
    private readonly notifications: NotificationService,
  ) {}

  listMine(userId: EntityId, workspaceId: EntityId): Promise<Subscription[]> {
    return this.repos.subscriptions.listByUser(userId, workspaceId);
  }

  /** Follows a board or a task with these kinds of change, or stops following it when there are none. */
  async follow(userId: EntityId, workspaceId: EntityId, target: SubscriptionTarget, events: SubscriptionEvent[]): Promise<Subscription | null> {
    const existing = (await this.listMine(userId, workspaceId)).find((s) => s.boardId === target.boardId && s.itemId === target.itemId);
    if (events.length === 0) {
      if (existing) await this.repos.subscriptions.delete(existing.id);
      return null;
    }
    const saved = await this.repos.subscriptions.upsert({ workspaceId, userId, boardId: target.boardId, itemId: target.itemId, events: [...new Set(events)] });
    // Following something on a board you had muted means you want to hear it.
    const preferences = await this.notifications.getPreferences(userId);
    if (preferences.mutedBoardIds.includes(target.boardId)) await this.notifications.setBoardSubscribed(userId, target.boardId, true);
    return saved;
  }

  async unfollow(id: EntityId): Promise<void> {
    await this.repos.subscriptions.delete(id);
  }

  /**
   * Hands a batch of feed entries to the followers. In a browser the edit does
   * not wait for them; on a server it does, since a request that has answered
   * may be stopped before anything left running finishes.
   */
  async track(activities: readonly Activity[]): Promise<void> {
    const run = this.fanOut(activities).catch((error) => console.error("Could not tell followers about a change", error));
    if (typeof window === "undefined") return run;
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
  }

  /** Resolves once everything handed to `track` so far has been delivered. For tests and the server. */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /** Tells each follower about the changes in this batch that they asked to hear about. */
  async fanOut(activities: readonly Activity[]): Promise<void> {
    const relevant = activities.flatMap((activity) => {
      const event = subscriptionEventFor(activity);
      return event && activity.boardId ? [{ activity, event }] : [];
    });
    if (relevant.length === 0) return;
    const boardIds = [...new Set(relevant.map((r) => r.activity.boardId!))];
    const follows = await this.repos.subscriptions.listByBoards(boardIds);
    if (follows.length === 0) return;

    // Only people still in the workspace hear anything.
    const workspaceIds = [...new Set(follows.map((f) => f.workspaceId))];
    const active = new Set<EntityId>();
    for (const workspaceId of workspaceIds) {
      for (const member of await this.repos.workspaces.listMembers(workspaceId)) if (member.status === "ACTIVE") active.add(`${workspaceId}:${member.userId}`);
    }

    // One notification per person and task (or board) for the whole batch.
    const byRecipient = new Map<string, { follow: Subscription; activities: Activity[] }>();
    for (const { activity, event } of relevant) {
      for (const follow of follows) {
        if (follow.boardId !== activity.boardId) continue;
        if (follow.itemId !== null && follow.itemId !== activity.itemId) continue;
        if (!follow.events.includes(event)) continue;
        if (follow.userId === activity.actorId) continue;
        if (!active.has(`${follow.workspaceId}:${follow.userId}`)) continue;
        const key = `${follow.userId}:${activity.itemId ?? activity.boardId}`;
        const entry = byRecipient.get(key);
        if (!entry) byRecipient.set(key, { follow, activities: [activity] });
        else if (!entry.activities.includes(activity)) entry.activities.push(activity);
      }
    }
    if (byRecipient.size === 0) return;

    const actorIds = [...new Set([...byRecipient.values()].flatMap((e) => e.activities.map((a) => a.actorId)))];
    const actors = new Map((await Promise.all(actorIds.map((id) => this.repos.users.getById(id)))).flatMap((u) => (u ? [[u.id, u.firstName || u.displayName] as const] : [])));

    const inputs: NotificationInput[] = [...byRecipient.values()].map(({ follow, activities: changes }) => {
      const first = changes[0]!;
      const message = subscriptionMessage(first, actors.get(first.actorId) ?? "Someone");
      const more = changes.length - 1;
      const body = more > 0 ? [message.body, `And ${more} more ${more === 1 ? "change" : "changes"}`].filter(Boolean).join(" · ") : message.body;
      return {
        userId: follow.userId,
        type: "SUBSCRIPTION",
        title: message.title,
        body,
        entityType: first.itemId ? "ITEM" : "BOARD",
        entityId: first.itemId ?? first.boardId!,
        boardId: first.boardId,
        workspaceId: first.workspaceId,
        actorId: first.actorId,
      };
    });
    await this.notifications.deliver(inputs);
  }
}

/**
 * The repositories with the activity feed wired to followers: whatever writes
 * an entry, followers hear of it. Everything else is passed through as it is.
 */
export function withFollowers(repos: Repositories, subscriptions: SubscriptionService): Repositories {
  const activities = repos.activities;
  return {
    ...repos,
    activities: {
      ...activities,
      listByWorkspace: (workspaceId, limit) => activities.listByWorkspace(workspaceId, limit),
      listByBoard: (boardId, limit) => activities.listByBoard(boardId, limit),
      listByItem: (itemId) => activities.listByItem(itemId),
      listStatusChanges: (workspaceId) => activities.listStatusChanges(workspaceId),
      // Named one by one: the spread above copies no methods off a class instance.
      listLastByBoard: (boardId, eventTypes, skipSynced) => activities.listLastByBoard(boardId, eventTypes, skipSynced),
      listStatusSinceByBoard: (boardId) => activities.listStatusSinceByBoard(boardId),
      create: async (input: ActivityInput) => {
        const created = await activities.create(input);
        await subscriptions.track([created]);
        return created;
      },
      createMany: async (inputs: ActivityInput[]) => {
        const created = await activities.createMany(inputs);
        await subscriptions.track(created);
        return created;
      },
    },
  };
}
