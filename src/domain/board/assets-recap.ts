/**
 * The Assets recap column: a badge summing up a task's deliverables. Its
 * settings say which parts the badge shows, in this order. A column from
 * before the settings existed shows assets, quantity and people in charge.
 */

export const ASSETS_RECAP_PARTS = ["assets", "quantity", "pic", "hours", "due", "done"] as const;
export type AssetsRecapPart = (typeof ASSETS_RECAP_PARTS)[number];

export interface AssetsRecapColumnSettings {
  kind: "assetsRecap";
  show: AssetsRecapPart[];
}

export const DEFAULT_ASSETS_RECAP_SETTINGS: AssetsRecapColumnSettings = { kind: "assetsRecap", show: ["assets", "quantity", "pic"] };

export const ASSETS_RECAP_PART_LABELS: Record<AssetsRecapPart, string> = {
  assets: "Number of assets",
  quantity: "Quantity (×25)",
  pic: "People in charge",
  hours: "Hours (effort)",
  due: "Next due date",
  done: "Done (3/5)",
};

/** A column's settings with anything missing filled in; at least one part always shows. */
export function assetsRecapSettings(settings: { kind: string } | null | undefined): AssetsRecapColumnSettings {
  if (settings?.kind !== "assetsRecap") return { ...DEFAULT_ASSETS_RECAP_SETTINGS, show: [...DEFAULT_ASSETS_RECAP_SETTINGS.show] };
  const wanted = Array.isArray((settings as Partial<AssetsRecapColumnSettings>).show) ? (settings as AssetsRecapColumnSettings).show : [];
  const show = ASSETS_RECAP_PARTS.filter((part) => wanted.includes(part));
  return { kind: "assetsRecap", show: show.length ? show : [...DEFAULT_ASSETS_RECAP_SETTINGS.show] };
}

/** The parts after switching one on or off, kept in their fixed order; the last one cannot be switched off. */
export function toggleAssetsRecapPart(show: readonly AssetsRecapPart[], part: AssetsRecapPart): AssetsRecapPart[] {
  const next = show.includes(part) ? show.filter((p) => p !== part) : [...show, part];
  return next.length ? ASSETS_RECAP_PARTS.filter((p) => next.includes(p)) : [...show];
}
