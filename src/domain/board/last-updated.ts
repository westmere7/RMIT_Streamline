import type { ActivityEventType } from "@/domain/activity/activity";

/**
 * The Last updated column: who last touched a task, and when, read off the
 * board's activity. Nothing is stored in the cell; its settings say which kinds
 * of change count as "touching" it and how the answer is shown.
 */

/** The kinds of change a board can count, each a handful of activity events. */
export const LAST_UPDATED_SOURCES = ["fields", "name", "moves", "assets", "updates", "links", "created"] as const;
export type LastUpdatedSource = (typeof LAST_UPDATED_SOURCES)[number];

export const LAST_UPDATED_SOURCE_LABELS: Record<LastUpdatedSource, string> = {
  fields: "Column changes",
  name: "Renaming",
  moves: "Moving and archiving",
  assets: "Asset changes",
  updates: "Updates posted",
  links: "Linking tasks",
  created: "Creating the task",
};

export const LAST_UPDATED_SOURCE_EVENTS: Record<LastUpdatedSource, readonly ActivityEventType[]> = {
  fields: ["ITEM_COLUMN_VALUE_UPDATED"],
  name: ["ITEM_RENAMED"],
  moves: ["ITEM_MOVED", "ITEM_ARCHIVED", "ITEM_RESTORED"],
  assets: ["ASSET_ADDED", "ASSET_UPDATED", "ASSET_REMOVED", "ASSET_COMPLETED", "ASSET_REOPENED"],
  updates: ["COMMENT_ADDED"],
  links: ["ITEM_LINKED", "ITEM_UNLINKED"],
  created: ["ITEM_CREATED"],
};

/** The person and the time, or one of them. */
export const LAST_UPDATED_DISPLAYS = ["both", "person", "time"] as const;
export type LastUpdatedDisplay = (typeof LAST_UPDATED_DISPLAYS)[number];
export const LAST_UPDATED_DISPLAY_LABELS: Record<LastUpdatedDisplay, string> = { both: "Person and time", person: "Person only", time: "Time only" };

/** "3h ago", or the day and time it happened. */
export const LAST_UPDATED_TIMES = ["relative", "exact"] as const;
export type LastUpdatedTime = (typeof LAST_UPDATED_TIMES)[number];
export const LAST_UPDATED_TIME_LABELS: Record<LastUpdatedTime, string> = { relative: "3h ago", exact: "Sep 16, 19:06" };

export interface LastUpdatedColumnSettings {
  kind: "last_updated";
  sources: LastUpdatedSource[];
  /** Leave out changes copied over from a linked task, so only work done here counts. */
  skipSynced: boolean;
  display: LastUpdatedDisplay;
  time: LastUpdatedTime;
}

export const DEFAULT_LAST_UPDATED_SETTINGS: LastUpdatedColumnSettings = {
  kind: "last_updated",
  sources: ["fields", "name", "moves", "assets", "updates", "created"],
  skipSynced: false,
  display: "both",
  time: "relative",
};

/** A column's settings with anything missing or unknown filled in. */
export function lastUpdatedSettings(settings: { kind: string } | null | undefined): LastUpdatedColumnSettings {
  if (settings?.kind !== "last_updated") return { ...DEFAULT_LAST_UPDATED_SETTINGS, sources: [...DEFAULT_LAST_UPDATED_SETTINGS.sources] };
  const s = settings as Partial<LastUpdatedColumnSettings>;
  const sources = Array.isArray(s.sources) ? s.sources.filter((x): x is LastUpdatedSource => (LAST_UPDATED_SOURCES as readonly string[]).includes(x)) : null;
  return {
    kind: "last_updated",
    sources: sources ?? [...DEFAULT_LAST_UPDATED_SETTINGS.sources],
    skipSynced: s.skipSynced === true,
    display: LAST_UPDATED_DISPLAYS.includes(s.display as LastUpdatedDisplay) ? s.display! : DEFAULT_LAST_UPDATED_SETTINGS.display,
    time: LAST_UPDATED_TIMES.includes(s.time as LastUpdatedTime) ? s.time! : DEFAULT_LAST_UPDATED_SETTINGS.time,
  };
}

/** The activity events a column counts, in a stable order so equal settings ask the same question. */
export function lastUpdatedEvents(settings: LastUpdatedColumnSettings): ActivityEventType[] {
  return LAST_UPDATED_SOURCES.filter((source) => settings.sources.includes(source)).flatMap((source) => LAST_UPDATED_SOURCE_EVENTS[source]);
}

/** One task's latest counted change: who, when and what. */
export interface LastActivity {
  itemId: string;
  actorId: string;
  at: string;
  eventType: ActivityEventType;
}
