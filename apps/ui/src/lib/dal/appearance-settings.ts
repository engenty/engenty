/**
 * DAL for appearance settings (tenant-scoped KV).
 * Fetches and persists appearance preferences via tenant-settings API.
 */
import {
  getTenantSettings,
  type SettingValueInput,
  setTenantSettings,
} from "@/lib/api/client";
import {
  APPEARANCE_KEYS,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME_MODE,
  FONT_OPTIONS,
} from "@/lib/appearance-constants";

export interface AppearanceSettings {
  colorBackground: string;
  colorPrimary: string;
  colorSecondary: string;
  contrast: string;
  font: string;
  fontSize: string;
  language: string;
  sidebarColor: string;
  sidebarMode: string;
  sidebarVisibility: string;
  themeMode: string;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  language: DEFAULT_LANGUAGE,
  themeMode: DEFAULT_THEME_MODE,
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  sidebarVisibility: "always",
  sidebarColor: "#ffffff",
  sidebarMode: "compact",
  colorPrimary: "#e0531b",
  colorSecondary: "#f1f3f5",
  colorBackground: "#faf8f5",
  contrast: "1.0",
};

const APPEARANCE_PREFIX = "appearance.";

function normalizeFontId(id: string): string {
  return FONT_OPTIONS.some((f) => f.id === id) ? id : DEFAULT_FONT;
}

function parseString(
  value: string | number | boolean | Record<string, unknown> | null | undefined,
  fallback: string
): string {
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

export async function getAppearanceSettings(
  signal?: AbortSignal
): Promise<AppearanceSettings> {
  // One request for the whole `appearance.*` namespace instead of one per key.
  const { settings } = await getTenantSettings(APPEARANCE_PREFIX, signal);
  const byName = new Map(settings.map((s) => [s.name, s.value]));
  const get = (key: string, fallback: string) =>
    parseString(byName.get(key), fallback);

  return {
    language: get(APPEARANCE_KEYS.language, DEFAULT_LANGUAGE),
    themeMode: get(APPEARANCE_KEYS.themeMode, DEFAULT_THEME_MODE),
    font: normalizeFontId(get(APPEARANCE_KEYS.font, DEFAULT_FONT)),
    fontSize: get(APPEARANCE_KEYS.fontSize, DEFAULT_FONT_SIZE),
    sidebarVisibility: get(APPEARANCE_KEYS.sidebarVisibility, "always"),
    sidebarColor: get(APPEARANCE_KEYS.sidebarColor, "#ffffff"),
    sidebarMode: get(APPEARANCE_KEYS.sidebarMode, "compact"),
    colorPrimary: get(APPEARANCE_KEYS.colorPrimary, "#e0531b"),
    colorSecondary: get(APPEARANCE_KEYS.colorSecondary, "#f1f3f5"),
    colorBackground: get(APPEARANCE_KEYS.colorBackground, "#faf8f5"),
    contrast: get(APPEARANCE_KEYS.contrast, "1.0"),
  };
}

export async function saveAppearanceSettings(
  current: AppearanceSettings,
  lastSaved: AppearanceSettings
): Promise<void> {
  // Diff each field; send only what changed, all in a single batch request.
  const fields: [keyof AppearanceSettings, string][] = [
    ["language", APPEARANCE_KEYS.language],
    ["themeMode", APPEARANCE_KEYS.themeMode],
    ["font", APPEARANCE_KEYS.font],
    ["fontSize", APPEARANCE_KEYS.fontSize],
    ["sidebarVisibility", APPEARANCE_KEYS.sidebarVisibility],
    ["sidebarColor", APPEARANCE_KEYS.sidebarColor],
    ["sidebarMode", APPEARANCE_KEYS.sidebarMode],
    ["colorPrimary", APPEARANCE_KEYS.colorPrimary],
    ["colorSecondary", APPEARANCE_KEYS.colorSecondary],
    ["colorBackground", APPEARANCE_KEYS.colorBackground],
    ["contrast", APPEARANCE_KEYS.contrast],
  ];

  const settings: Array<SettingValueInput & { name: string }> = [];
  for (const [field, name] of fields) {
    if (current[field] !== lastSaved[field]) {
      settings.push({ name, type: "string", value_string: current[field] });
    }
  }

  if (settings.length > 0) {
    await setTenantSettings(settings);
  }
}
