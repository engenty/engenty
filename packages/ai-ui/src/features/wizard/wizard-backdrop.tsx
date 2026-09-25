"use client";

// The wizard's backdrop, in the landing page's language: one deep band of
// colour, a single soft light in a corner, the question set straight on the
// band in cream, and an engenty standing in the corner.
//
// The band is picked, not generated: the landing's fills, the one nearest the
// space's own colour (or, without one, drawn from the wizard's id). The same
// wizard in the same space always opens on the same band and the same
// engenty.

import {
  cn,
  ENGENTY_CORE_KINDS,
  Engenty,
  type EngentyKind,
} from "@engenty/ui-core";
import type { CSSProperties } from "react";

/** The landing's deep fills that carry cream type, by hue. */
const BAND_FILLS = [
  { fill: "oklch(44% 0.16 30)", hue: 30 },
  { fill: "oklch(38% 0.16 264)", hue: 264 },
  { fill: "oklch(36% 0.12 150)", hue: 150 },
  { fill: "oklch(42% 0.16 18)", hue: 18 },
  { fill: "oklch(48% 0.14 68)", hue: 68 },
  { fill: "oklch(36% 0.13 310)", hue: 310 },
  { fill: "oklch(35% 0.14 285)", hue: 285 },
  { fill: "oklch(40% 0.10 120)", hue: 120 },
  { fill: "oklch(36% 0.09 200)", hue: 200 },
] as const;

/** Cream on the band, as on the landing. */
export const WIZARD_BAND_CREAM = "oklch(88% 0.11 75)";

const GLOW_CORNERS = [
  { left: -160, top: -180 },
  { right: -160, top: -180 },
  { bottom: -180, left: -160 },
  { bottom: -180, right: -160 },
] as const;

/** A stable, non-negative number from a string. */
function stableHash(seed: string): number {
  let hash = 7;
  for (const char of seed) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647;
  }
  return hash;
}

/** The hue of a `#rrggbb` colour, or null for anything else (grey too). */
export function hueOfHexColor(color: string | null | undefined): number | null {
  const match = color
    ?.trim()
    .match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) {
    return null;
  }
  const [r, g, b] = [match[1], match[2], match[3]].map(
    (hex) => Number.parseInt(hex ?? "0", 16) / 255
  ) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) {
    return null;
  }
  let sector: number;
  if (max === r) {
    sector = ((g - b) / delta + 6) % 6;
  } else if (max === g) {
    sector = (b - r) / delta + 2;
  } else {
    sector = (r - g) / delta + 4;
  }
  return Math.round(sector * 60) % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface WizardBand {
  corner: number;
  fill: string;
  kind: EngentyKind;
}

/** Which band, light and engenty a wizard opens on. */
export function wizardBand(seed: string, color?: string | null): WizardBand {
  const hash = stableHash(seed);
  const hue = hueOfHexColor(color);
  const band =
    hue === null
      ? BAND_FILLS[hash % BAND_FILLS.length]
      : [...BAND_FILLS].sort(
          (a, b) => hueDistance(a.hue, hue) - hueDistance(b.hue, hue)
        )[0];
  return {
    corner: hash % GLOW_CORNERS.length,
    fill: band?.fill ?? BAND_FILLS[0].fill,
    kind:
      ENGENTY_CORE_KINDS[hash % ENGENTY_CORE_KINDS.length] ??
      ENGENTY_CORE_KINDS[0] ??
      "round",
  };
}

/**
 * The band behind the whole screen, with its one light. Fixed to the
 * viewport, so it runs on under the end pane beside the page too — the host
 * leaves the shell's own fill off (`contentStackBackground: "none"`).
 */
export function WizardBackdrop({
  band,
  className,
}: {
  band: WizardBand;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("fixed inset-0 overflow-hidden", className)}
      style={{ background: band.fill }}
    >
      <span
        className="absolute rounded-full"
        style={{
          background: "#fff",
          filter: "blur(90px)",
          height: 520,
          opacity: 0.12,
          width: 520,
          ...GLOW_CORNERS[band.corner],
        }}
      />
    </div>
  );
}

/**
 * The band's theme for what sits on it: cream type, hairlines of light, and a
 * white primary action in the band's own colour — the landing's button. Set
 * as the design tokens themselves, so every field a surface draws follows
 * without knowing it is on a band. A list that opens in place (a picker's
 * results) is a deeper shade of the band, opaque over what it covers.
 */
export function wizardBandTokens(band: WizardBand): CSSProperties {
  return {
    "--accent": "oklch(100% 0 0 / 0.12)",
    "--accent-foreground": "oklch(99% 0.01 80)",
    "--background": "transparent",
    "--border": "oklch(100% 0 0 / 0.28)",
    "--border-soft": "oklch(100% 0 0 / 0.16)",
    "--card": "oklch(100% 0 0 / 0.08)",
    "--card-foreground": "oklch(99% 0.01 80)",
    "--foreground": "oklch(99% 0.01 80)",
    "--input": "oklch(100% 0 0 / 0.45)",
    "--link": WIZARD_BAND_CREAM,
    "--muted": "oklch(100% 0 0 / 0.1)",
    "--muted-foreground": "oklch(92% 0.03 40 / 0.78)",
    "--popover": `color-mix(in oklch, ${band.fill} 72%, black)`,
    "--popover-foreground": "oklch(99% 0.01 80)",
    "--primary": "oklch(100% 0 0)",
    "--primary-foreground": band.fill,
    "--ring": "oklch(100% 0 0 / 0.7)",
    "--secondary": "oklch(100% 0 0 / 0.12)",
    "--secondary-foreground": "oklch(99% 0.01 80)",
    // A note's tint is light on the page; on the band it is a veil of light,
    // and its coloured edge keeps saying what kind of note it is.
    "--danger-tint": "oklch(100% 0 0 / 0.1)",
    "--info-tint": "oklch(100% 0 0 / 0.1)",
    "--success-tint": "oklch(100% 0 0 / 0.1)",
    "--warning-tint": "oklch(100% 0 0 / 0.1)",
    // A record card is the same veil, edged in light instead of shadow.
    "--ui-canvas-raised-border-c": "oklch(100% 0 0 / 0.22)",
    "--ui-canvas-raised-shadow": "none",
    "--ui-card-bg": "oklch(100% 0 0 / 0.1)",
    "--ui-card-fg": "oklch(99% 0.01 80)",
    "--ui-card-filter": "none",
    color: "var(--foreground)",
  } as CSSProperties;
}

/** The band's engenty, standing in the corner as the landing's cast does. */
export function WizardBandEngenty({
  band,
  className,
}: {
  band: WizardBand;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none flex flex-col items-center",
        className
      )}
    >
      <Engenty kind={band.kind} size={88} />
      <span className="-mt-2 h-2.5 w-14 rounded-[50%] bg-black/25 blur-[3px]" />
    </span>
  );
}
