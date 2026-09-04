/** ISO-8601 timestamp string, e.g. "2026-09-04T03:12:00.000Z". */
export type ISODateTime = string;

/** Calendar date without time, formatted yyyy-MM-dd. */
export type ISODate = string;

export type EntityId = string;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A named colour token used for teams, groups, statuses and priorities. */
export type ColorToken =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "rose"
  | "gray"
  | "navy";

export const COLOR_TOKENS: readonly ColorToken[] = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
  "gray",
  "navy",
];
