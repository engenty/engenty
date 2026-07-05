/**
 * Font Registration for PDF Generation
 * =====================================
 * Registers custom fonts with priority:
 * 1. Manifest entries (pre-resolved URLs from DB settings)
 * 2. Local fonts (bundled font files)
 */

import { existsSync } from "node:fs";
import { Font } from "@react-pdf/renderer";
import { type FontDefinition, LOCAL_FONTS } from "./localFonts.js";

// Built-in fonts that don't need loading
const BUILTIN_FONTS = new Set(["Helvetica", "Times-Roman", "Courier"]);

// Standard font weights for variable fonts
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
type StandardWeight = (typeof WEIGHTS)[number];

// Track registered font families AND their weights
// Key: family name, Value: Set of registered weights
const registeredWeights = new Map<string, Set<number>>();

/**
 * Check if a family has all required weights registered
 */
function hasRequiredWeights(
  family: string,
  requiredWeights: number[] = [400, 700]
): boolean {
  const weights = registeredWeights.get(family);
  if (!weights) {
    return false;
  }
  return requiredWeights.every((w) => weights.has(w));
}

/**
 * Try to register a font family from local bundled assets.
 * Returns true if successful.
 */
function tryRegisterFamilyFromLocal(family: string): boolean {
  // Check if already registered with required weights (400 for regular, 700 for bold)
  if (hasRequiredWeights(family, [400, 700])) {
    return true;
  }

  // If partially registered, warn and continue (react-pdf doesn't support re-registration)
  if (registeredWeights.has(family)) {
    console.warn(
      `[PDF Fonts] Font "${family}" already registered but missing some weights. React-PDF doesn't support re-registration.`
    );
    return true;
  }

  const fontDef = LOCAL_FONTS[family];
  if (!fontDef) {
    return false;
  }

  const fonts: {
    src: string;
    fontWeight: StandardWeight;
    fontStyle: "normal" | "italic";
  }[] = [];

  // Check for individual weight files first (preferred)
  const weightKeys: Array<keyof FontDefinition> = [
    "w100",
    "w200",
    "w300",
    "w400",
    "w500",
    "w600",
    "w700",
    "w800",
    "w900",
  ];
  const weightMap: Record<string, StandardWeight> = {
    w100: 100,
    w200: 200,
    w300: 300,
    w400: 400,
    w500: 500,
    w600: 600,
    w700: 700,
    w800: 800,
    w900: 900,
  };

  for (const key of weightKeys) {
    const url = fontDef[key] as string | undefined;
    if (url) {
      // Register both normal and italic variants (React-PDF needs both)
      fonts.push({
        src: url,
        fontWeight: weightMap[key],
        fontStyle: "normal",
      });
      fonts.push({
        src: url,
        fontWeight: weightMap[key],
        fontStyle: "italic",
      });
    }
  }

  // If no individual weights, check for regular/bold
  if (fonts.length === 0) {
    if (fontDef.regular) {
      // Register both normal and italic variants
      fonts.push({
        src: fontDef.regular,
        fontWeight: 400,
        fontStyle: "normal",
      });
      fonts.push({
        src: fontDef.regular,
        fontWeight: 400,
        fontStyle: "italic",
      });
    }
    if (fontDef.bold) {
      // Register both normal and italic variants
      fonts.push({ src: fontDef.bold, fontWeight: 700, fontStyle: "normal" });
      fonts.push({ src: fontDef.bold, fontWeight: 700, fontStyle: "italic" });
    }
  }

  // If still no fonts, check for variable font
  if (fonts.length === 0 && fontDef.variable) {
    // Register variable font for all standard weights with both normal and italic
    for (const w of WEIGHTS) {
      fonts.push({
        src: fontDef.variable,
        fontWeight: w,
        fontStyle: "normal",
      });
      fonts.push({
        src: fontDef.variable,
        fontWeight: w,
        fontStyle: "italic",
      });
    }
  }

  // Drop font files that aren't on disk. The Fontshare families are not
  // redistributable (ITF EULA) and ship only in the pro repo — an OSS
  // checkout registers what it has and falls back to Helvetica otherwise.
  const present = fonts.filter((font) => existsSync(font.src));
  if (present.length < fonts.length) {
    console.warn(
      `[PDF Fonts] Font "${family}": ${fonts.length - present.length} file(s) missing on disk — ` +
        "if this is a Fontshare family, download it from fontshare.com into packages/pdf-service/assets/fonts/fontshare/"
    );
  }
  fonts.length = 0;
  fonts.push(...present);

  if (fonts.length === 0) {
    return false;
  }

  try {
    Font.register({ family, fonts });

    // Track registered weights
    const weights = [...new Set(fonts.map((f) => f.fontWeight))].sort(
      (a, b) => a - b
    );
    registeredWeights.set(family, new Set(weights));

    return true;
  } catch (error) {
    console.error(`[PDF Fonts] Failed to register font "${family}":`, error);
    return false;
  }
}

export interface FontManifestItem {
  family: string;
  style?: string;
  url: string;
  weight?: number;
}

/**
 * Ensure all fonts referenced in the theme are registered.
 * Priority:
 * 1. Manifest entries (pre-resolved URLs from DB settings)
 * 2. Local bundled fonts (assets/fonts)
 */
export function ensureThemeFonts(
  theme: { fonts?: Record<string, { family?: string }> },
  manifest: FontManifestItem[] = []
): void {
  const families = new Set<string>();
  const addFamily = (f?: string) => {
    if (f) {
      families.add(f);
    }
  };
  // Support both old and new theme structure
  addFamily(theme?.fonts?.text?.family);
  addFamily(theme?.fonts?.headline?.family);
  addFamily(theme?.fonts?.fixed?.family);
  addFamily(theme?.fonts?.title?.family);
  addFamily(theme?.fonts?.small?.family);

  // First, try to use manifest entries if provided (pre-resolved URLs)
  const byFamily = new Map<string, FontManifestItem[]>();
  for (const entry of manifest) {
    // Ensure manifest families are always registered, even if the theme doesn't reference them
    addFamily(entry.family);
    if (!byFamily.has(entry.family)) {
      byFamily.set(entry.family, []);
    }
    byFamily.get(entry.family)!.push(entry);
  }

  for (const family of families) {
    // Skip built-in fonts
    if (BUILTIN_FONTS.has(family)) {
      continue;
    }

    // Check if we have manifest entries for this font
    const entries = byFamily.get(family);
    const validEntries = (entries || []).filter(
      (e) => typeof e?.url === "string" && e.url.trim().length > 0
    );

    if (entries?.length && validEntries.length === 0) {
      console.warn(
        `[PDF Fonts] Font manifest entries for "${family}" had no valid URL; trying local fonts.`
      );
    }

    if (validEntries.length) {
      // Priority 1: Use manifest entries (pre-resolved URLs from DB settings)
      const weighted = validEntries.filter((e) => typeof e.weight === "number");

      // If manifest doesn't specify weights, assume it's a single variable font file
      // and register it for all standard weights so fontWeight changes take effect.
      if (weighted.length === 0) {
        const first = validEntries[0];
        Font.register({
          family,
          fonts: WEIGHTS.map((w) => ({
            src: first.url,
            fontWeight: w,
            fontStyle: (first.style as "normal" | "italic") || "normal",
          })),
        });
        registeredWeights.set(family, new Set(WEIGHTS));
      } else {
        // Check if manifest is missing critical weights (400 for regular, 700 for bold)
        // If so, try to supplement with local fonts instead of using incomplete manifest
        const manifestWeights = new Set(weighted.map((e) => e.weight));
        const hasRegular = manifestWeights.has(400);
        const hasBold = manifestWeights.has(700);

        if (!(hasRegular && hasBold)) {
          // Manifest is incomplete - prefer local fonts if available
          const localDef = LOCAL_FONTS[family];
          if (
            localDef &&
            (localDef.w400 || localDef.regular) &&
            (localDef.w700 || localDef.bold) &&
            tryRegisterFamilyFromLocal(family)
          ) {
            continue; // Skip to next family, local registration succeeded
          }
        }

        // Use manifest entries
        Font.register({
          family,
          fonts: weighted.map((e) => ({
            src: e.url,
            fontWeight: (e.weight as StandardWeight) || undefined,
            fontStyle: (e.style as "normal" | "italic") || "normal",
          })),
        });
        registeredWeights.set(
          family,
          new Set(weighted.map((e) => e.weight as number))
        );
      }
    } else if (tryRegisterFamilyFromLocal(family)) {
      // Priority 2: Try local bundled fonts (assets/fonts, assets/fontshare)
      // Already registered inside tryRegisterFamilyFromLocal
    } else {
      console.warn(
        `[PDF Fonts] Font "${family}" not found in manifest or local fonts. Using fallback (Helvetica).`
      );
    }
  }

  // Built-in fonts (Helvetica/Times-Roman/Courier) are provided by react-pdf.
  // Do not call Font.register with an undefined src (this crashes inside @react-pdf/font).
}

/**
 * Check if a font family is actually registered (or built-in).
 * Only returns true when Font.register succeeded or for built-in fonts.
 */
export function isFontRegistered(family: string): boolean {
  return registeredWeights.has(family) || BUILTIN_FONTS.has(family);
}

/**
 * Clear font registration cache (useful for testing)
 */
export function clearFontCache(): void {
  registeredWeights.clear();
}
