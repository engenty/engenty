/** Landing token fills with CSS-var fallbacks (apps/ui defines these). */
export const ENGENTY_FILL = {
  cobalt: "var(--cobalt, oklch(50% 0.18 264))",
  amber: "var(--amber, oklch(72% 0.16 68))",
  moss: "var(--moss, oklch(48% 0.13 150))",
  rose: "var(--rose, oklch(58% 0.20 18))",
  ember: "var(--ember, oklch(64% 0.195 35))",
} as const;

export type EngentyKind = "round" | "drop" | "dome" | "flame" | "oval";

export const ENGENTY_KINDS: EngentyKind[] = [
  "round",
  "drop",
  "dome",
  "flame",
  "oval",
];
