/**
 * Font weight normalization utility for PDF generation.
 * Maps OpenType weight class names and aliases to numeric values.
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass
 */

// OpenType weight class mapping with aliases
const WEIGHT_MAP: Record<string, number> = {
  // Numeric as strings
  "100": 100,
  "200": 200,
  "300": 300,
  "400": 400,
  "500": 500,
  "600": 600,
  "700": 700,
  "800": 800,
  "900": 900,

  // Standard names (what @react-pdf/font supports)
  thin: 100,
  ultralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  ultrabold: 800,
  heavy: 900,

  // Aliases (OpenType spec and common usage)
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  extralight: 200,
  regular: 400,
  book: 400,
  "semi-bold": 600,
  "demi-bold": 600,
  demibold: 600,
  "extra-bold": 800,
  extrabold: 800,
  "ultra-bold": 800,
  black: 900,
  fat: 900,
  poster: 900,
};

/**
 * Normalize a font weight value (string or number) to a numeric weight.
 * Supports OpenType weight class names and common aliases.
 */
export function normalizeFontWeight(
  weight: string | number | undefined
): number | undefined {
  if (weight === undefined) {
    return;
  }
  if (typeof weight === "number") {
    return weight;
  }

  const normalized = weight.toLowerCase().trim();
  return WEIGHT_MAP[normalized] ?? 400; // Default to normal if unknown
}

/**
 * Recursively normalize fontWeight properties in a style object.
 * This ensures all fontWeight values are numeric before StyleSheet.create.
 */
export function normalizeStylesWithFontWeight<
  T extends Record<string, unknown>,
>(styles: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(styles)) {
    if (key === "fontWeight") {
      result[key] = normalizeFontWeight(value as string | number);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = normalizeStylesWithFontWeight(
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
