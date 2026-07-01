/**
 * KB hub cover picker — colors and gradients derived from Engenty Ember / shadcn tokens
 * (see packages/design-tokens). Values use `var(--token)` or gradients of vars so covers
 * track theme changes when stored.
 */

import type { KbCover } from "../src/schema/types.js";

/** Light/pastel palette — pair with dark text. */
export const KB_COVER_THEME_LIGHT_COLOR_VARS = [
  "--paper",
  "--paper-2",
  "--paper-3",
  "--card",
  "--ember-tint",
  "--cobalt-tint",
  "--moss-tint",
  "--amber-tint",
  "--rose-tint",
  "--muted",
  "--accent",
  "--secondary",
] as const;

/** Saturated / dark palette — pair with light text. */
export const KB_COVER_THEME_VIBRANT_COLOR_VARS = [
  "--ember-strong",
  "--ember",
  "--cobalt",
  "--moss",
  "--rose",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--danger",
  "--success",
  "--info",
  "--link",
] as const;

export const KB_COVER_THEME_COLOR_VARS = [
  ...KB_COVER_THEME_LIGHT_COLOR_VARS,
  ...KB_COVER_THEME_VIBRANT_COLOR_VARS,
] as const;

/** Pairs of CSS variables for `linear-gradient(135deg, …)`. */
export const KB_COVER_THEME_GRADIENT_PAIRS = [
  ["--ember", "--cobalt"],
  ["--cobalt", "--moss"],
  ["--moss", "--amber"],
  ["--amber", "--rose"],
  ["--rose", "--ember"],
  ["--ember-strong", "--paper-3"],
  ["--primary", "--muted"],
  ["--chart-1", "--chart-2"],
] as const;

export interface KbCoverThemePreset {
  /** Short label for `title` / a11y (not necessarily translated). */
  label: string;
  /** Persisted `KbCover.value` (hex, `var(--…)`, or full gradient string). */
  value: string;
}

export type KbCoverColorPresetTone = "light" | "vibrant";

export interface KbCoverThemeColorSection {
  presets: KbCoverThemePreset[];
  tone: KbCoverColorPresetTone;
}

function formatCssVarLabel(varName: string): string {
  return varName.replace(/^--/, "").replace(/-/g, " ");
}

function varsToPresets(vars: readonly string[]): KbCoverThemePreset[] {
  return vars.map((name) => ({
    value: `var(${name})`,
    label: formatCssVarLabel(name),
  }));
}

export function kbCoverThemeColorPresets(): KbCoverThemePreset[] {
  if (typeof document === "undefined") {
    return [];
  }
  return varsToPresets(KB_COVER_THEME_COLOR_VARS);
}

/** Sectioned color presets — `light` first (current), then `vibrant`. */
export function kbCoverThemeColorPresetSections(): KbCoverThemeColorSection[] {
  if (typeof document === "undefined") {
    return [];
  }
  return [
    { tone: "light", presets: varsToPresets(KB_COVER_THEME_LIGHT_COLOR_VARS) },
    {
      tone: "vibrant",
      presets: varsToPresets(KB_COVER_THEME_VIBRANT_COLOR_VARS),
    },
  ];
}

export function kbCoverThemeGradientPresets(): KbCoverThemePreset[] {
  return KB_COVER_THEME_GRADIENT_PAIRS.map(([a, b]) => ({
    value: `linear-gradient(135deg, var(${a}) 0%, var(${b}) 100%)`,
    label: `${formatCssVarLabel(a)} → ${formatCssVarLabel(b)}`,
  }));
}

/* ── Light vs dark surface decision (for title/description text color) ── */

const LIGHT_COLOR_VAR_SET = new Set<string>(KB_COVER_THEME_LIGHT_COLOR_VARS);
const VIBRANT_COLOR_VAR_SET = new Set<string>(
  KB_COVER_THEME_VIBRANT_COLOR_VARS
);

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const cs = c / 255;
    return cs <= 0.039_28 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseHexColor(value: string): [number, number, number] | null {
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) {
    return null;
  }
  const h = m[1];
  if (h.length === 3) {
    return [
      Number.parseInt(h[0] + h[0], 16),
      Number.parseInt(h[1] + h[1], 16),
      Number.parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function parseRgbColor(value: string): [number, number, number] | null {
  const m = value
    .trim()
    .match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i);
  if (!m) {
    return null;
  }
  return [
    Number.parseInt(m[1], 10),
    Number.parseInt(m[2], 10),
    Number.parseInt(m[3], 10),
  ];
}

/**
 * Whether the cover paint should be treated as "light" — title/description use dark text.
 * Image and gradient covers are always treated as dark (use light text + drop shadow).
 * Color covers map known `var(--…)` tokens to the light/vibrant sets, and fall back
 * to a luminance parse for raw `#hex` or `rgb()` values.
 */
export function kbCoverIsLight(cover: KbCover | null | undefined): boolean {
  if (!cover) {
    return true;
  }
  if (cover.type === "image" || cover.type === "gradient") {
    return false;
  }
  const v = cover.value.trim();
  const varMatch = v.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) {
    const token = varMatch[1];
    if (LIGHT_COLOR_VAR_SET.has(token)) {
      return true;
    }
    if (VIBRANT_COLOR_VAR_SET.has(token)) {
      return false;
    }
    return true;
  }
  const rgb = parseHexColor(v) ?? parseRgbColor(v);
  if (!rgb) {
    return true;
  }
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) > 0.55;
}

export function normalizeGradientCss(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveSolidPaintSample(cssColor: string): string {
  if (typeof document === "undefined") {
    return cssColor.trim().toLowerCase();
  }
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:-9999px;top:0;width:2px;height:2px;visibility:hidden;";
  el.style.backgroundColor = cssColor;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).backgroundColor.trim().toLowerCase();
  document.body.removeChild(el);
  return resolved;
}

function resolveGradientPaintSample(cssGradient: string): string {
  if (typeof document === "undefined") {
    return normalizeGradientCss(cssGradient);
  }
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:-9999px;top:0;width:48px;height:48px;visibility:hidden;";
  el.style.background = cssGradient;
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const img = cs.backgroundImage?.trim();
  const bg = cs.background?.trim() ?? "";
  const out = img && img !== "none" ? img : bg;
  document.body.removeChild(el);
  return out.toLowerCase();
}

export function kbCoverMatchesPresetValue(
  current: KbCover | null | undefined,
  type: KbCover["type"],
  presetValue: string
): boolean {
  if (!current || current.type !== type) {
    return false;
  }
  if (type === "gradient") {
    const a = normalizeGradientCss(current.value);
    const b = normalizeGradientCss(presetValue);
    if (a === b) {
      return true;
    }
    if (typeof document === "undefined") {
      return false;
    }
    return resolveGradientPaintSample(a) === resolveGradientPaintSample(b);
  }
  const a = current.value.trim().toLowerCase();
  const b = presetValue.trim().toLowerCase();
  if (a === b) {
    return true;
  }
  if (typeof document === "undefined") {
    return false;
  }
  return (
    resolveSolidPaintSample(current.value) ===
    resolveSolidPaintSample(presetValue)
  );
}
