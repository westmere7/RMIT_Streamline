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
  red: { solid: "bg-red-500 text-white", soft: "bg-red-50 text-red-700", dot: "bg-red-500", text: "text-red-600", border: "border-red-500", hex: "#ef4444" },
  orange: { solid: "bg-orange-500 text-white", soft: "bg-orange-50 text-orange-700", dot: "bg-orange-500", text: "text-orange-600", border: "border-orange-500", hex: "#f97316" },
  amber: { solid: "bg-amber-400 text-amber-950", soft: "bg-amber-50 text-amber-800", dot: "bg-amber-400", text: "text-amber-700", border: "border-amber-400", hex: "#fbbf24" },
  yellow: { solid: "bg-yellow-400 text-yellow-950", soft: "bg-yellow-50 text-yellow-800", dot: "bg-yellow-400", text: "text-yellow-700", border: "border-yellow-400", hex: "#facc15" },
  lime: { solid: "bg-lime-500 text-lime-950", soft: "bg-lime-50 text-lime-800", dot: "bg-lime-500", text: "text-lime-700", border: "border-lime-500", hex: "#84cc16" },
  green: { solid: "bg-green-600 text-white", soft: "bg-green-50 text-green-700", dot: "bg-green-600", text: "text-green-700", border: "border-green-600", hex: "#16a34a" },
  teal: { solid: "bg-teal-600 text-white", soft: "bg-teal-50 text-teal-700", dot: "bg-teal-600", text: "text-teal-700", border: "border-teal-600", hex: "#0d9488" },
  cyan: { solid: "bg-cyan-600 text-white", soft: "bg-cyan-50 text-cyan-700", dot: "bg-cyan-600", text: "text-cyan-700", border: "border-cyan-600", hex: "#0891b2" },
  sky: { solid: "bg-sky-500 text-white", soft: "bg-sky-50 text-sky-700", dot: "bg-sky-500", text: "text-sky-600", border: "border-sky-500", hex: "#0ea5e9" },
  blue: { solid: "bg-blue-600 text-white", soft: "bg-blue-50 text-blue-700", dot: "bg-blue-600", text: "text-blue-600", border: "border-blue-600", hex: "#2563eb" },
  indigo: { solid: "bg-indigo-600 text-white", soft: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-600", text: "text-indigo-600", border: "border-indigo-600", hex: "#4f46e5" },
  violet: { solid: "bg-violet-600 text-white", soft: "bg-violet-50 text-violet-700", dot: "bg-violet-600", text: "text-violet-600", border: "border-violet-600", hex: "#7c3aed" },
  purple: { solid: "bg-purple-600 text-white", soft: "bg-purple-50 text-purple-700", dot: "bg-purple-600", text: "text-purple-600", border: "border-purple-600", hex: "#9333ea" },
  pink: { solid: "bg-pink-500 text-white", soft: "bg-pink-50 text-pink-700", dot: "bg-pink-500", text: "text-pink-600", border: "border-pink-500", hex: "#ec4899" },
  rose: { solid: "bg-rose-600 text-white", soft: "bg-rose-50 text-rose-700", dot: "bg-rose-600", text: "text-rose-600", border: "border-rose-600", hex: "#e11d48" },
  gray: { solid: "bg-gray-400 text-white", soft: "bg-gray-100 text-gray-700", dot: "bg-gray-400", text: "text-gray-600", border: "border-gray-400", hex: "#9ca3af" },
  navy: { solid: "bg-navy-800 text-white", soft: "bg-navy-50 text-navy-800", dot: "bg-navy-800", text: "text-navy-700", border: "border-navy-800", hex: "#000054" },
};

export function colorClasses(token: ColorToken | undefined | null): ColorClasses {
  return COLOR_CLASSES[token ?? "gray"];
}

/** Deterministic avatar colour derived from a string (user id). */
const AVATAR_TOKENS: ColorToken[] = ["red", "orange", "green", "teal", "sky", "blue", "indigo", "violet", "pink", "navy"];

export function avatarColorFor(seed: string): ColorToken {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TOKENS[hash % AVATAR_TOKENS.length] ?? "blue";
}
