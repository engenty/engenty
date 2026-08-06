import {
  BUILT_IN_UNIT_KEYS,
  type BuiltInUnitDefinition,
} from "./locale-config.js";

export interface EditorUnitOption {
  is_default: boolean;
  label: string;
  singular?: string;
  value: string;
}

/**
 * Merge tenant custom units with locale-aware built-ins.
 * Built-in keys (`text`, `fixed`, `h`, `d`) always use `builtIns` labels so
 * editors follow the UI language (same labels as the settings page).
 */
export function normalizeCommercialUnits(
  rawUnits: unknown,
  builtIns: BuiltInUnitDefinition[]
): EditorUnitOption[] {
  const source = Array.isArray(rawUnits) ? rawUnits : [];
  const custom: EditorUnitOption[] = [];
  for (const entry of source) {
    const unit = (entry ?? {}) as Record<string, unknown>;
    const rawValue =
      (typeof unit.name === "string" && unit.name) ||
      (typeof unit.value === "string" && unit.value) ||
      (typeof unit.abbreviation === "string" && unit.abbreviation) ||
      "";
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    if (
      BUILT_IN_UNIT_KEYS.includes(value as (typeof BUILT_IN_UNIT_KEYS)[number])
    ) {
      continue;
    }
    const rawPlural =
      (typeof unit.label === "string" && unit.label) ||
      (typeof unit.plural === "string" && unit.plural) ||
      value;
    const rawSingular =
      (typeof unit.singular === "string" && unit.singular) || undefined;
    custom.push({
      value,
      label: rawPlural.trim() || value,
      singular: rawSingular?.trim() || undefined,
      is_default: false,
    });
  }

  const merged = new Map<string, EditorUnitOption>();
  for (const unit of builtIns) {
    merged.set(unit.name, {
      value: unit.name,
      label: unit.label,
      singular: unit.singular,
      is_default: false,
    });
  }
  for (const unit of custom) {
    merged.set(unit.value, unit);
  }

  const units = Array.from(merged.values());
  const defaultUnitValue =
    units.find((unit) => unit.value === "h")?.value ?? units[0]?.value ?? "h";
  return units.map((unit) => ({
    ...unit,
    is_default: unit.value === defaultUnitValue,
  }));
}
