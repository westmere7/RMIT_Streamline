import type { ItemOpenMode } from "@/stores/board-ui-store";

/**
 * The table's view settings, which the board as a whole goes by: whether the
 * ticket column shows, where a task opens, and how the pop-up's feed reads.
 * Per person per board, and kept with a saved view like any view setting.
 */
export interface TableViewSettings extends Record<string, unknown> {
  showTicket: boolean;
  openIn: ItemOpenMode;
  /** The pop-up feed shows the task's history among its updates. */
  feedActivity: boolean;
  /** Every update above the history lines; off, the two run together by time. */
  feedUpdatesOnTop: boolean;
  /** The history lines faded back behind the updates. */
  feedFade: boolean;
}

export const TABLE_VIEW_DEFAULTS: TableViewSettings = {
  showTicket: true,
  openIn: "panel",
  feedActivity: true,
  feedUpdatesOnTop: false,
  feedFade: true,
};

/** How the pop-up's feed reads, as the panel asks for it. */
export interface FeedOptions {
  activity: boolean;
  updatesOnTop: boolean;
  fade: boolean;
}

export const DEFAULT_FEED_OPTIONS: FeedOptions = { activity: true, updatesOnTop: false, fade: true };

export function feedOptionsOf(settings: Partial<TableViewSettings>): FeedOptions {
  return {
    activity: settings.feedActivity !== false,
    updatesOnTop: settings.feedUpdatesOnTop === true,
    fade: settings.feedFade !== false,
  };
}

export function feedSettingsPatch(patch: Partial<FeedOptions>): Partial<TableViewSettings> {
  return {
    ...(patch.activity !== undefined ? { feedActivity: patch.activity } : {}),
    ...(patch.updatesOnTop !== undefined ? { feedUpdatesOnTop: patch.updatesOnTop } : {}),
    ...(patch.fade !== undefined ? { feedFade: patch.fade } : {}),
  };
}
