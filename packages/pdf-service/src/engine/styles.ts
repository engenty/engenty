import type { PdfStyleObject } from "../types";
import { isFontRegistered } from "./fonts.js";
import { normalizeStylesWithFontWeight } from "./fontWeight.js";

type AnyObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is AnyObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge<T extends AnyObject>(
  target: T,
  source: Partial<T>
): T {
  const out: AnyObject = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as AnyObject, value as AnyObject);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

function maybeParseNumber(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)(pt)?$/);
  if (!match) {
    return value;
  }
  return Number(match[1]);
}

function normalizeStyleValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeStyleValue);
  }
  if (isPlainObject(value)) {
    const out: AnyObject = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeStyleValue(v);
    }
    return out;
  }
  return maybeParseNumber(value);
}

function normalizeFontFamiliesInValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeFontFamiliesInValue);
  }
  if (isPlainObject(value)) {
    const out: AnyObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "fontFamily" && typeof v === "string" && v.trim()) {
        out[k] = isFontRegistered(v) ? v : "Helvetica";
        continue;
      }
      out[k] = normalizeFontFamiliesInValue(v);
    }
    return out;
  }
  return value;
}

export function normalizeStyles(styles: PdfStyleObject): PdfStyleObject {
  const normalized = normalizeStyleValue(styles) as PdfStyleObject;
  const withFontFallbacks = normalizeFontFamiliesInValue(
    normalized
  ) as PdfStyleObject;
  // Normalize fontWeight values to numeric (required by react-pdf)
  return normalizeStylesWithFontWeight(withFontFallbacks);
}
