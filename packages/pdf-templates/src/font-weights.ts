/**
 * Font weight utilities for PDF templates UI.
 * Determines available weights based on font definitions.
 *
 * This mirrors the structure in @engenty/pdf-service/src/engine/localFonts.ts
 * but only contains weight information (no file paths) for UI use.
 */

/** Font weight option for UI */
export interface FontWeightOption {
  label: string;
  value: number;
}

/** Human-readable weight labels */
const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** Built-in fonts that don't need dynamic loading */
const BUILTIN_FONTS = new Set(["Helvetica", "Times-Roman", "Courier"]);

/**
 * Available weights per font family.
 * Mirrors the structure in pdf-service/src/engine/localFonts.ts LOCAL_FONTS.
 * Each array contains the numeric weight values (100-900) that have font files.
 */
const FONT_WEIGHTS: Record<string, number[]> = {
  // Built-in fonts
  Helvetica: [400, 700],
  "Times-Roman": [400, 700],
  Courier: [400, 700],

  // Google Fonts - Static weight files
  Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Roboto: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Open Sans": [300, 400, 500, 600, 700, 800],
  Montserrat: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Lato: [100, 300, 400, 700, 900],
  Poppins: [100, 200, 300, 400, 500, 600, 700, 800, 900],

  // Fontshare - Static weight files
  Satoshi: [300, 400, 500, 700, 900],
  "General Sans": [200, 300, 400, 500, 600, 700],
  "Clash Grotesk": [200, 300, 400, 500, 600, 700],
  Switzer: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Supreme: [100, 200, 300, 400, 500, 700, 800],
  Author: [200, 300, 400, 500, 600, 700],
  Chillax: [200, 300, 400, 500, 600, 700],
  Ranade: [100, 300, 400, 500, 700],
  Boska: [200, 300, 400, 500, 700, 900],
  "Bespoke Serif": [300, 400, 500, 700, 800],
  Sentient: [200, 300, 400, 500, 700],
  Telma: [300, 400, 500, 700, 900],
  Zodiak: [100, 300, 400, 700, 800, 900],
  Stardom: [400],
};

/**
 * Get available font weights for a given font family.
 * Returns all weight options that have corresponding font files.
 */
export function getAvailableWeights(family: string): FontWeightOption[] {
  // Built-in fonts only support 400 and 700
  if (BUILTIN_FONTS.has(family)) {
    return [
      { value: 400, label: "Regular" },
      { value: 700, label: "Bold" },
    ];
  }

  const weights = FONT_WEIGHTS[family];
  if (!weights || weights.length === 0) {
    // Unknown font - return common weights
    return [
      { value: 400, label: "Regular" },
      { value: 700, label: "Bold" },
    ];
  }

  return weights.map((w) => ({
    value: w,
    label: WEIGHT_LABELS[w] || `Weight ${w}`,
  }));
}

/**
 * Get the closest valid weight for a font family.
 * If the requested weight isn't available, returns the nearest available weight.
 */
export function getClosestWeight(
  family: string,
  requestedWeight: number
): number {
  const available = getAvailableWeights(family);
  if (available.length === 0) {
    return 400;
  }

  // Find exact match
  const exact = available.find((w) => w.value === requestedWeight);
  if (exact) {
    return exact.value;
  }

  // Find closest weight
  let closest = available[0]!;
  let minDiff = Math.abs(closest.value - requestedWeight);
  for (const weight of available) {
    const diff = Math.abs(weight.value - requestedWeight);
    if (diff < minDiff) {
      minDiff = diff;
      closest = weight;
    }
  }
  return closest.value;
}
