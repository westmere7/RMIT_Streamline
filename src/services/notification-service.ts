import type { EntityId, Notification, NotificationInput, NotificationPreferences, NotificationPreferencesInput, StoredDelivery } from "@/domain";
import { defaultNotificationPreferences, deliveryFor } from "@/domain";
import type { DeliverableNotification, Repositories } from "@/data/repositories";

/**
 * The one place a notification is decided and written.
 *
 * Everything that wants to tell someone something calls `deliver`, and the
 * recipient's own preferences decide what happens: interrupt them (a red badge
 * and, with permission, an operating-system notification), collect it quietly as
 * an update (a grey badge), or drop it entirely because they have unsubscribed
 * from that board. Services never make that decision themselves — one rule, one
 * place, for both providers.
 */
export class NotificationService {
  constructor(private readonly repos: Repositories) {}

  async getPreferences(userId: EntityId): Promise<NotificationPreferences> {
    return (await this.repos.notificationPreferences.get(userId)) ?? defaultNotificationPreferences(userId);
  }

  async savePreferences(userId: EntityId, patch: NotificationPreferencesInput): Promise<NotificationPreferences> {
    return this.repos.notificationPreferences.save(userId, patch);
  }

  /** Unsubscribes from, or resubscribes to, one board. */
  async setBoardSubscribed(userId: EntityId, boardId: EntityId, subscribed: boolean): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const muted = new Set(current.mutedBoardIds);
    if (subscribed) muted.delete(boardId);
    else muted.add(boardId);
    return this.repos.notificationPreferences.save(userId, { mutedBoardIds: [...muted] });
  }

  /**
   * Writes each notification the way its recipient asked to receive it, and
   * silently drops the ones they have turned off. Returns what was written, so a
   * caller can tell whether anything actually landed.
   */
  async deliver(inputs: readonly NotificationInput[]): Promise<Notification[]> {
    if (inputs.length === 0) return [];
    const preferences = await this.repos.notificationPreferences.getMany(inputs.map((input) => input.userId));

    const deliverable: DeliverableNotification[] = [];
    for (const input of inputs) {
      const delivery = deliveryFor(preferences.get(input.userId), input.type, input.boardId);
      if (delivery === "OFF") continue;
      deliverable.push({ ...input, delivery: delivery satisfies StoredDelivery });
    }
    if (deliverable.length === 0) return [];
    return this.repos.notifications.createMany(deliverable);
  }

  /** Convenience for the single-recipient case. */
  async deliverOne(input: NotificationInput): Promise<Notification | null> {
    const [created] = await this.deliver([input]);
    return created ?? null;
  }
}
