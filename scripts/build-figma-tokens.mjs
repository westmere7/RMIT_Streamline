#!/usr/bin/env node
/**
 * Writes design/figma/tokens.json: the app's design tokens in the Tokens Studio
 * format (one file, several sets, with themes), for the Tokens Studio plugin to
 * turn into Figma variables and styles.
 *
 *   global   type, spacing, radii, the RMIT navy ramp and the label palette's
 *            fixed shades
 *   light    the semantic colours and shadows of the light theme (:root)
 *   dark     the same, for .dark
 *   dim      .dark with .dark.dim laid over it
 *
 * The semantic colours are read from src/app/globals.css, so this stays true as
 * that file changes. The label palette (the 17 colours a status, tag or group can
 * be) is design/figma/label-palette.json, read off the rendered app because the
 * classes resolve through Tailwind's own colours.
 *
 *   node scripts/build-figma-tokens.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const palette = JSON.parse(fs.readFileSync(path.join(root, "design/figma/label-palette.json"), "utf8"));

/** The custom properties declared directly in the block opened by `selector {`. */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = block(":root");
const dark = block(".dark");
const dim = { ...dark, ...block(".dark.dim") };
const theme = block("@theme inline");

/** "0 1px 2px rgb(20 22 48 / 0.04), 0 ..." as Tokens Studio box shadows. */
function shadows(value) {
  return value.split(/,(?![^(]*\))/).map((part) => {
    const m = part.trim().match(/^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?\s+rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/);
    if (!m) throw new Error(`Cannot read shadow: ${part}`);
    const [, x, y, blur, spread = "0", r, g, b, a] = m;
    const hex = (n) => Number(n).toString(16).padStart(2, "0");
    return { x, y, blur, spread, color: `#${hex(r)}${hex(g)}${hex(b)}${hex(Math.round(Number(a) * 255))}`, type: "dropShadow" };
  });
}

const COLOR_NAMES = [
  "canvas", "background", "foreground", "surface", "surface-strong", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground",
  "accent-soft", "accent-soft-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "navy",
  "sidebar", "sidebar-foreground", "sidebar-border", "sidebar-accent", "scrollbar-thumb",
];

const DESCRIPTIONS = {
  canvas: "The shell behind every panel",
  background: "Page and table background",
  surface: "Lanes, wells, quiet fills",
  "surface-strong": "A step up from surface: Kanban cards, link tiles",
  card: "Panels and cards",
  primary: "RMIT red: the one primary action per screen",
  "accent-soft": "Selected and on states",
  ring: "Focus rings and interactive indigo",
};

function semantic(vars) {
  const color = {};
  for (const name of COLOR_NAMES) {
    if (!vars[name]) continue;
    color[name] = { value: vars[name], type: "color", ...(DESCRIPTIONS[name] ? { description: DESCRIPTIONS[name] } : {}) };
  }
  const shadow = {};
  for (const size of ["xs", "sm", "md", "lg", "xl", "2xl"]) {
    if (vars[`elev-${size}`]) shadow[size] = { value: shadows(vars[`elev-${size}`]), type: "boxShadow" };
  }
  return { color, shadow };
}

function labelSet(mode) {
  const label = {};
  for (const [name, modes] of Object.entries(palette)) {
    const v = modes[mode];
    label[name] = {
      solid: { value: v.solid, type: "color", description: "Filled chip: status, priority, button" },
      "solid-text": { value: v.solidText, type: "color" },
      soft: { value: v.soft, type: "color", description: "Tinted chip: tags, soft buttons" },
      "soft-text": { value: v.softText, type: "color" },
      text: { value: v.text, type: "color" },
    };
  }
  return label;
}

const radius = Number.parseFloat(light.radius) * 16;
const navy = {};
for (const [key, value] of Object.entries(theme)) {
  const m = key.match(/^color-navy-(\d+)$/);
  if (m) navy[m[1]] = { value, type: "color" };
}

const global = {
  font: {
    family: { sans: { value: "Inter", type: "fontFamilies" }, mono: { value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", type: "fontFamilies" } },
    weight: { regular: { value: "Regular", type: "fontWeights" }, medium: { value: "Medium", type: "fontWeights" }, semibold: { value: "Semi Bold", type: "fontWeights" }, bold: { value: "Bold", type: "fontWeights" } },
    size: Object.fromEntries([["2xs", 11], ["xs", 12], ["cell", 13], ["sm", 14], ["md", 15], ["base", 16], ["lg", 18], ["xl", 20], ["figure", 22], ["2xl", 24], ["3xl", 30]].map(([k, v]) => [k, { value: String(v), type: "fontSizes" }])),
  },
  typography: Object.fromEntries(
    [
      ["caption", "2xs", "medium", "135%", "Section labels, counts"],
      ["small", "xs", "regular", "140%", "Hints, meta lines"],
      ["cell", "cell", "regular", "150%", "Table cells, menus, body of panels"],
      ["cell-strong", "cell", "medium", "150%", "Buttons, item names"],
      ["body", "sm", "regular", "150%", "Default body text"],
      ["group-title", "md", "semibold", "130%", "Group headers"],
      ["panel-title", "xl", "semibold", "125%", "Task panel title"],
      ["page-title", "2xl", "semibold", "120%", "Board and page titles"],
      ["figure", "figure", "semibold", "100%", "Big numbers on tiles and the dashboard"],
    ].map(([name, size, weight, lineHeight, description]) => [
      name,
      { value: { fontFamily: "{font.family.sans}", fontWeight: `{font.weight.${weight}}`, fontSize: `{font.size.${size}}`, lineHeight, letterSpacing: name.includes("title") ? "-1%" : "0%" }, type: "typography", description },
    ]),
  ),
  radius: {
    sm: { value: String(radius - 4), type: "borderRadius" },
    md: { value: String(radius - 2), type: "borderRadius" },
    lg: { value: String(radius), type: "borderRadius", description: "Inputs, menus" },
    xl: { value: String(radius + 4), type: "borderRadius", description: "Cards, tiles, Kanban cards" },
    "2xl": { value: String(radius + 10), type: "borderRadius", description: "Lanes, sections" },
    full: { value: "9999", type: "borderRadius", description: "Pills, toolbar buttons" },
  },
  spacing: Object.fromEntries([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12].map((n) => [String(n).replace(".", "_"), { value: String(n * 4), type: "spacing" }])),
  size: {
    "row-height": { value: "40", type: "sizing", description: "A table row" },
    "control-sm": { value: "32", type: "sizing" },
    "control-md": { value: "36", type: "sizing" },
    "control-touch": { value: "44", type: "sizing", description: "Phone tap targets" },
  },
  navy,
};

const tokens = {
  global,
  light: { ...semantic(light), label: labelSet("light") },
  dark: { ...semantic(dark), label: labelSet("dark") },
  dim: { ...semantic(dim), label: labelSet("dark") },
  $themes: ["light", "dark", "dim"].map((name) => ({
    id: name,
    name: name[0].toUpperCase() + name.slice(1),
    selectedTokenSets: { global: "source", [name]: "enabled" },
  })),
  $metadata: { tokenSetOrder: ["global", "light", "dark", "dim"] },
};

const out = path.join(root, "design/figma/tokens.json");
fs.writeFileSync(out, `${JSON.stringify(tokens, null, 2)}\n`);
const count = (o) => Object.values(o).reduce((n, v) => n + (v && typeof v === "object" && "value" in v ? 1 : v && typeof v === "object" ? count(v) : 0), 0);
console.log(`Wrote ${path.relative(root, out)}: ${count({ global, light: tokens.light, dark: tokens.dark, dim: tokens.dim })} tokens`);
