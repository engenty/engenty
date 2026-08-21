/**
 * Landing token fills, one per engenty kind.
 *
 * The first five are the founding cast and map straight onto brand tokens. The
 * later five are derived from those same tokens by rotating hue (and, for
 * `slate`, dropping chroma) rather than being fixed colours: the palette has no
 * token at those hues, and hard-coding one would stop the newer engenties
 * tracking the tenant's theme, the light/dark flip and the contrast scalar the
 * way the originals do.
 */
export const ENGENTY_FILL = {
  cobalt: "var(--cobalt, oklch(50% 0.18 264))",
  amber: "var(--amber, oklch(72% 0.16 68))",
  moss: "var(--moss, oklch(48% 0.13 150))",
  rose: "var(--rose, oklch(58% 0.20 18))",
  ember: "var(--ember, oklch(64% 0.195 35))",
  teal: "oklch(from var(--moss, oklch(48% 0.13 150)) l calc(c * 1.05) calc(h + 46))",
  violet:
    "oklch(from var(--cobalt, oklch(50% 0.18 264)) l calc(c * 1.05) calc(h + 44))",
  magenta: "oklch(from var(--rose, oklch(58% 0.20 18)) l c calc(h - 40))",
  citron:
    "oklch(from var(--moss, oklch(48% 0.13 150)) calc(l * 1.24) calc(c * 1.1) calc(h - 42))",
  slate:
    "oklch(from var(--cobalt, oklch(50% 0.18 264)) calc(l * 0.86) calc(c * 0.42) calc(h - 20))",
} as const;

export type EngentyKind =
  | "round"
  | "drop"
  | "dome"
  | "flame"
  | "oval"
  | "bean"
  | "pebble"
  | "sprout"
  | "tower"
  | "wedge";

/** The founding five. The brand mark cycles these so it stays recognisable. */
export const ENGENTY_CORE_KINDS: EngentyKind[] = [
  "round",
  "drop",
  "dome",
  "flame",
  "oval",
];

export const ENGENTY_KINDS: EngentyKind[] = [
  ...ENGENTY_CORE_KINDS,
  "bean",
  "pebble",
  "sprout",
  "tower",
  "wedge",
];
