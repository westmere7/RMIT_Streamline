import type { ColorToken } from "@/domain";

export interface ColorClasses {
  /** Filled pill: background + readable text. */
  solid: string;
  /** Soft tint: light background + dark text. */
  soft: string;
  /** Small dot / bar. */
  dot: string;
  /** Text only. */
  text: string;
  /** Left border accent. */
  border: string;
  /** Hex used for inline styles (e.g. timeline bars). */
  hex: string;
}

export const COLOR_CLASSES: Record<ColorToken, ColorClasses> = {
  red: { solid: "bg-red-500 text-white", soft: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", border: "border-red-500", hex: "#ef4444" },
  orange: { solid: "bg-orange-500 text-white", soft: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500", hex: "#f97316" },
  amber: { solid: "bg-amber-400 text-amber-950", soft: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-400", text: "text-amber-700 dark:text-amber-400", border: "border-amber-400", hex: "#fbbf24" },
  yellow: { solid: "bg-yellow-400 text-yellow-950", soft: "bg-yellow-50 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300", dot: "bg-yellow-400", text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-400", hex: "#facc15" },
  lime: { solid: "bg-lime-500 text-lime-950", soft: "bg-lime-50 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300", dot: "bg-lime-500", text: "text-lime-700 dark:text-lime-400", border: "border-lime-500", hex: "#84cc16" },
  green: { solid: "bg-green-600 text-white", soft: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300", dot: "bg-green-600", text: "text-green-700 dark:text-green-400", border: "border-green-600", hex: "#16a34a" },
  teal: { solid: "bg-teal-600 text-white", soft: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", dot: "bg-teal-600", text: "text-teal-700 dark:text-teal-400", border: "border-teal-600", hex: "#0d9488" },
  cyan: { solid: "bg-cyan-600 text-white", soft: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", dot: "bg-cyan-600", text: "text-cyan-700 dark:text-cyan-400", border: "border-cyan-600", hex: "#0891b2" },
  sky: { solid: "bg-sky-500 text-white", soft: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500", hex: "#0ea5e9" },
  blue: { solid: "bg-blue-600 text-white", soft: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", dot: "bg-blue-600", text: "text-blue-600 dark:text-blue-400", border: "border-blue-600", hex: "#2563eb" },
  indigo: { solid: "bg-indigo-600 text-white", soft: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", dot: "bg-indigo-600", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-600", hex: "#4f46e5" },
  violet: { solid: "bg-violet-600 text-white", soft: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", dot: "bg-violet-600", text: "text-violet-600 dark:text-violet-400", border: "border-violet-600", hex: "#7c3aed" },
  purple: { solid: "bg-purple-600 text-white", soft: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", dot: "bg-purple-600", text: "text-purple-600 dark:text-purple-400", border: "border-purple-600", hex: "#9333ea" },
  pink: { solid: "bg-pink-500 text-white", soft: "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", dot: "bg-pink-500", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500", hex: "#ec4899" },
  rose: { solid: "bg-rose-600 text-white", soft: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", dot: "bg-rose-600", text: "text-rose-600 dark:text-rose-400", border: "border-rose-600", hex: "#e11d48" },
  gray: { solid: "bg-gray-400 text-white", soft: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300", dot: "bg-gray-400", text: "text-gray-600 dark:text-gray-400", border: "border-gray-400", hex: "#9ca3af" },
  navy: { solid: "bg-navy-800 text-white", soft: "bg-navy-50 text-navy-800 dark:bg-navy-500/40 dark:text-navy-100", dot: "bg-navy-800", text: "text-navy-700 dark:text-navy-200", border: "border-navy-800", hex: "#000054" },
};

export function colorClasses(token: ColorToken | undefined | null): ColorClasses {
  return COLOR_CLASSES[token ?? "gray"];
}

/** Deterministic avatar colour derived from a string (user id). */
const AVATAR_TOKENS: ColorToken[] = ["red", "orange", "green", "teal", "sky", "blue", "indigo", "violet", "pink", "navy"];

/**
 * Colour for a tag that the column's palette does not define yet (e.g. tags that
 * arrived with seeded data). Deterministic, so the same tag always reads the same.
 */
const TAG_TOKENS: ColorToken[] = ["indigo", "violet", "sky", "teal", "green", "amber", "orange", "rose", "pink", "cyan"];

export function tagColorFor(seed: string): ColorToken {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  return TAG_TOKENS[hash % TAG_TOKENS.length] ?? "indigo";
}

export function avatarColorFor(seed: string): ColorToken {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TOKENS[hash % AVATAR_TOKENS.length] ?? "blue";
}
