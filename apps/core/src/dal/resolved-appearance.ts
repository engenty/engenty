import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import { createUserSettingsRepoSupabase } from "@engenty/user-settings";
import type { SupabaseClient } from "@supabase/supabase-js";

const APPEARANCE_PREFIX = "appearance.";

const APPEARANCE_KEYS = {
  language: "appearance.language",
  themeMode: "appearance.theme_mode",
  font: "appearance.font",
  fontSize: "appearance.font_size",
  sidebarVisibility: "appearance.sidebar_visibility",
  sidebarColor: "appearance.sidebar_color",
  colorPrimary: "appearance.color_primary",
  colorSecondary: "appearance.color_secondary",
  colorBackground: "appearance.color_background",
  contrast: "appearance.contrast",
  colorBlind: "appearance.colorblind",
} as const;

const DEFAULT_LANGUAGE = "en";
const DEFAULT_THEME_MODE = "system";
const DEFAULT_FONT = "geist";
const DEFAULT_FONT_SIZE = "100";
const DEFAULT_SIDEBAR_VISIBILITY = "always";
const DEFAULT_SIDEBAR_COLOR = "#ffffff";
const DEFAULT_COLOR_PRIMARY = "#e0531b";
const DEFAULT_COLOR_SECONDARY = "#f1f3f5";
const DEFAULT_COLOR_BACKGROUND = "#faf8f5";
const DEFAULT_CONTRAST = "normal";
const DEFAULT_TENANT_CONTRAST = "1.0";
const DEFAULT_COLOR_BLIND = "none";

const KNOWN_FONT_IDS = new Set([
  "geist",
  "system",
  "barlow",
  "noto-sans-display",
  "geist-mono",
  "fira-mono",
]);

function normalizeFontId(id: string): string {
  return KNOWN_FONT_IDS.has(id) ? id : DEFAULT_FONT;
}

export interface ResolvedAppearance {
  colorBackground?: string;
  colorBlind?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  contrast?: string;
  font: string;
  fontSize: string;
  language: string;
  sidebarColor?: string;
  sidebarVisibility?: string;
  tenantContrast?: string;
  themeMode: string;
}

interface SettingEntry {
  name: string;
  value: string | number | boolean | Record<string, unknown> | null;
}

/**
 * Read one batch of `appearance.*` settings into a name→string map. Non-string
 * and null values are dropped so callers fall back to the next layer.
 */
function toStringMap(entries: SettingEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (typeof entry.value === "string" && entry.value.length > 0) {
      map.set(entry.name, entry.value);
    }
  }
  return map;
}

/** Pick the first map that has the key, else the fallback. */
function pick(
  key: string,
  fallback: string,
  ...maps: Map<string, string>[]
): string {
  for (const map of maps) {
    const value = map.get(key);
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
}

/** Get resolved appearance when user has no tenant (onboarded: false). */
export async function getResolvedAppearanceWithoutTenant(
  client: SupabaseClient,
  userId: string
): Promise<ResolvedAppearance> {
  const userRepo = createUserSettingsRepoSupabase(client as never, userId);
  const user = toStringMap(await userRepo.list(APPEARANCE_PREFIX));

  return {
    font: DEFAULT_FONT,
    fontSize: pick(APPEARANCE_KEYS.fontSize, DEFAULT_FONT_SIZE, user),
    language: pick(APPEARANCE_KEYS.language, DEFAULT_LANGUAGE, user),
    themeMode: pick(APPEARANCE_KEYS.themeMode, DEFAULT_THEME_MODE, user),
    sidebarVisibility: DEFAULT_SIDEBAR_VISIBILITY,
    sidebarColor: DEFAULT_SIDEBAR_COLOR,
    colorPrimary: pick(
      APPEARANCE_KEYS.colorPrimary,
      DEFAULT_COLOR_PRIMARY,
      user
    ),
    colorSecondary: pick(
      APPEARANCE_KEYS.colorSecondary,
      DEFAULT_COLOR_SECONDARY,
      user
    ),
    colorBackground: pick(
      APPEARANCE_KEYS.colorBackground,
      DEFAULT_COLOR_BACKGROUND,
      user
    ),
    tenantContrast: DEFAULT_TENANT_CONTRAST,
    contrast: pick(APPEARANCE_KEYS.contrast, DEFAULT_CONTRAST, user),
    colorBlind: pick(APPEARANCE_KEYS.colorBlind, DEFAULT_COLOR_BLIND, user),
  };
}

export async function getResolvedAppearance(
  client: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<ResolvedAppearance> {
  const tenantRepo = createTenantSettingsRepoSupabase(
    client as never,
    tenantId,
    "default"
  );
  const userRepo = createUserSettingsRepoSupabase(client as never, userId);

  // Two queries total — one per scope — instead of one round trip per key.
  const [tenantEntries, userEntries] = await Promise.all([
    tenantRepo.list(APPEARANCE_PREFIX),
    userRepo.list(APPEARANCE_PREFIX),
  ]);
  const tenant = toStringMap(tenantEntries);
  const user = toStringMap(userEntries);

  // Precedence for each key: user override → tenant default → hardcoded default.
  return {
    font: normalizeFontId(pick(APPEARANCE_KEYS.font, DEFAULT_FONT, tenant)),
    fontSize: pick(APPEARANCE_KEYS.fontSize, DEFAULT_FONT_SIZE, user, tenant),
    language: pick(APPEARANCE_KEYS.language, DEFAULT_LANGUAGE, user, tenant),
    themeMode: pick(
      APPEARANCE_KEYS.themeMode,
      DEFAULT_THEME_MODE,
      user,
      tenant
    ),
    sidebarVisibility: pick(
      APPEARANCE_KEYS.sidebarVisibility,
      DEFAULT_SIDEBAR_VISIBILITY,
      user,
      tenant
    ),
    sidebarColor: pick(
      APPEARANCE_KEYS.sidebarColor,
      DEFAULT_SIDEBAR_COLOR,
      user,
      tenant
    ),
    colorPrimary: pick(
      APPEARANCE_KEYS.colorPrimary,
      DEFAULT_COLOR_PRIMARY,
      user,
      tenant
    ),
    colorSecondary: pick(
      APPEARANCE_KEYS.colorSecondary,
      DEFAULT_COLOR_SECONDARY,
      user,
      tenant
    ),
    colorBackground: pick(
      APPEARANCE_KEYS.colorBackground,
      DEFAULT_COLOR_BACKGROUND,
      user,
      tenant
    ),
    // Tenant contrast is a separate display value; user contrast is "normal"/"high".
    tenantContrast: pick(
      APPEARANCE_KEYS.contrast,
      DEFAULT_TENANT_CONTRAST,
      tenant
    ),
    contrast: pick(APPEARANCE_KEYS.contrast, DEFAULT_CONTRAST, user),
    colorBlind: pick(APPEARANCE_KEYS.colorBlind, DEFAULT_COLOR_BLIND, user),
  };
}
