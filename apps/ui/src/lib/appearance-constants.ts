/**
 * Appearance settings keys and option constants.
 * Stored in tenant-settings KV; applied at bootstrap and on the Appearance page.
 */
export const APPEARANCE_KEYS = {
  language: "appearance.language",
  themeMode: "appearance.theme_mode",
  font: "appearance.font",
  fontSize: "appearance.font_size",
  sidebarVisibility: "appearance.sidebar_visibility",
  sidebarMode: "appearance.sidebar_mode",
  sidebarColor: "appearance.sidebar_color",
  colorPrimary: "appearance.color_primary",
  colorSecondary: "appearance.color_secondary",
  colorBackground: "appearance.color_background",
  contrast: "appearance.contrast",
} as const;

export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_THEME_MODE = "system";
/** Engenty Ember stack: Geist UI + Space Grotesk headings + Geist Mono */
export const DEFAULT_FONT = "engenty";
export const DEFAULT_FONT_SIZE = "100";

const SYSTEM_FONT_SANS =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

export interface FontOption {
  category: "Sans-serif" | "System" | "Monospace";
  family: string;
  googleFontName?: string;
  headingFamily: string;
  id: string;
  monoFamily: string;
  name: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: "engenty",
    name: "System Default",
    family: '"Geist", ui-sans-serif, system-ui, sans-serif',
    headingFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"Geist Mono", ui-monospace, monospace',
    category: "Sans-serif",
  },
  {
    id: "inter",
    name: "Inter",
    family: '"Inter", ui-sans-serif, system-ui, sans-serif',
    headingFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"Geist Mono", ui-monospace, monospace',
    category: "Sans-serif",
    googleFontName: "Inter",
  },
  {
    id: "barlow",
    name: "Barlow",
    family: '"Barlow", ui-sans-serif, system-ui, sans-serif',
    headingFamily: '"Barlow", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"Geist Mono", ui-monospace, monospace',
    category: "Sans-serif",
    googleFontName: "Barlow",
  },
  {
    id: "noto-sans-display",
    name: "Noto Sans Display",
    family: '"Noto Sans Display", ui-sans-serif, system-ui, sans-serif',
    headingFamily: '"Noto Sans Display", ui-sans-serif, system-ui, sans-serif',
    monoFamily: '"Geist Mono", ui-monospace, monospace',
    category: "Sans-serif",
    googleFontName: "Noto+Sans+Display",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    family: '"IBM Plex Mono", ui-monospace, monospace',
    headingFamily: '"IBM Plex Mono", ui-monospace, monospace',
    monoFamily: '"IBM Plex Mono", ui-monospace, monospace',
    category: "Monospace",
    googleFontName: "IBM+Plex+Mono",
  },
  {
    id: "fira-mono",
    name: "Fira Mono",
    family: '"Fira Mono", ui-monospace, monospace',
    headingFamily: '"Fira Mono", ui-monospace, monospace',
    monoFamily: '"Fira Mono", ui-monospace, monospace',
    category: "Monospace",
    googleFontName: "Fira+Mono",
  },
] as const;

export const FONT_SIZE_OPTIONS = [
  { id: "80", label: "80%", scale: 0.8 },
  { id: "90", label: "90%", scale: 0.9 },
  { id: "100", label: "100%", scale: 1 },
  { id: "110", label: "110%", scale: 1.1 },
  { id: "125", label: "125%", scale: 1.25 },
] as const;

/** CSS var on `<html>`; multiplied with shell root px in index.css (not inline font-size). */
export const APPEARANCE_FONT_SCALE_VAR = "--appearance-font-scale";

export const THEME_MODES = [
  { id: "light" as const, labelKey: "userMenu.light_theme" },
  { id: "dark" as const, labelKey: "userMenu.dark_theme" },
  { id: "system" as const, labelKey: "userMenu.system_theme" },
];

export const LANGUAGES = [
  { code: "en" as const, flag: "🇬🇧", label: "English" },
  { code: "de" as const, flag: "🇩🇪", label: "Deutsch" },
];

export function applyFont(fontId: string) {
  const font = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0];

  if (font.googleFontName) {
    const linkId = "google-font-import";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${font.googleFontName}:wght@400;500;600;700&display=swap`;
  }

  document.documentElement.style.setProperty("--font-sans", font.family);
  document.documentElement.style.setProperty(
    "--font-heading",
    font.headingFamily
  );
  document.documentElement.style.setProperty("--font-mono", font.monoFamily);
}

export function resolveFontSizeScale(sizeId: string): number {
  const option =
    FONT_SIZE_OPTIONS.find((o) => o.id === sizeId) ??
    FONT_SIZE_OPTIONS.find((o) => o.id === DEFAULT_FONT_SIZE);
  return option?.scale ?? 1;
}

export function applyFontSize(sizeId: string) {
  document.documentElement.style.setProperty(
    APPEARANCE_FONT_SCALE_VAR,
    String(resolveFontSizeScale(sizeId))
  );
  // Legacy: inline font-size beat index.css rem scale (100% → 16px always).
  document.documentElement.style.removeProperty("font-size");
}

export interface ColorSet {
  dark: {
    primary: string;
    secondary: string;
    background: string;
    sidebar: string;
  };
  id: string;
  light: {
    primary: string;
    secondary: string;
    background: string;
    sidebar: string;
  };
  nameKey: string;
}

export const COLOR_SETS_PRESETS: readonly ColorSet[] = [
  {
    id: "ember",
    nameKey: "settings.colorSetEmber",
    light: {
      primary: "#e0531b",
      secondary: "#f1f3f5",
      background: "#faf8f5",
      sidebar: "#ffffff",
    },
    dark: {
      primary: "",
      secondary: "",
      background: "",
      sidebar: "",
    },
  },
  {
    id: "ocean",
    nameKey: "settings.colorSetOcean",
    light: {
      primary: "#0284C5",
      secondary: "#B3CCE6",
      background: "#EDF2F7",
      sidebar: "#ffffff",
    },
    dark: {
      primary: "#0ea5e9",
      secondary: "#0f172a",
      background: "#0b0f19",
      sidebar: "#0f172a",
    },
  },
  {
    id: "cobalt",
    nameKey: "settings.colorSetCobalt",
    light: {
      primary: "#1e40af",
      secondary: "#dbeafe",
      background: "#f8faff",
      sidebar: "#1e40af",
    },
    dark: {
      primary: "#3b82f6",
      secondary: "#1e293b",
      background: "#0b0f19",
      sidebar: "#111827",
    },
  },
  {
    id: "moss",
    nameKey: "settings.colorSetMoss",
    light: {
      primary: "#065f46",
      secondary: "#d1fae5",
      background: "#f7fdf9",
      sidebar: "#065f46",
    },
    dark: {
      primary: "#10b981",
      secondary: "#062f22",
      background: "#051410",
      sidebar: "#062f22",
    },
  },
  {
    id: "rose",
    nameKey: "settings.colorSetRose",
    light: {
      primary: "#9f1239",
      secondary: "#ffe4e6",
      background: "#fff9f9",
      sidebar: "#9f1239",
    },
    dark: {
      primary: "#f43f5e",
      secondary: "#310b14",
      background: "#140508",
      sidebar: "#310b14",
    },
  },
] as const;

export function applyCustomColors(
  primary?: string,
  secondary?: string,
  background?: string,
  contrast?: string
) {
  const html = document.documentElement;
  if (primary !== undefined) {
    html.dataset.rawPrimary = primary;
  }
  if (secondary !== undefined) {
    html.dataset.rawSecondary = secondary;
  }
  if (background !== undefined) {
    html.dataset.rawBackground = background;
  }
  if (contrast !== undefined) {
    html.dataset.tenantContrast = contrast;
  }
  syncThemeStyles();
}

function getContrastColor(hex: string): string {
  const color = hex.replace("#", "");
  if (color.length === 3) {
    const r = Number.parseInt(color[0] + color[0], 16);
    const g = Number.parseInt(color[1] + color[1], 16);
    const b = Number.parseInt(color[2] + color[2], 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#18181b" : "#ffffff";
  }
  if (color.length === 6) {
    const r = Number.parseInt(color.slice(0, 2), 16);
    const g = Number.parseInt(color.slice(2, 4), 16);
    const b = Number.parseInt(color.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#18181b" : "#ffffff";
  }
  return "#18181b";
}

export function applySidebarColor(colorId: string) {
  const html = document.documentElement;
  if (!colorId || colorId === "default" || colorId === "") {
    delete html.dataset.rawSidebar;
  } else {
    let hex = colorId;
    const presets: Record<string, string> = {
      white: "#ffffff",
      dark: "#1e1e1e",
      cobalt: "#1e40af",
      moss: "#065f46",
      rose: "#9f1239",
    };

    if (presets[colorId]) {
      hex = presets[colorId];
    }
    html.dataset.rawSidebar = hex;
  }
  syncThemeStyles();
}

export function syncThemeStyles() {
  const html = document.documentElement;
  const isDark = html.classList.contains("dark");

  const rawPrimary = html.dataset.rawPrimary || "";
  const rawSecondary = html.dataset.rawSecondary || "";
  const rawBackground = html.dataset.rawBackground || "";
  const rawSidebar = html.dataset.rawSidebar || "";

  // Check if we match a preset based on raw (light) colors
  const activePreset = COLOR_SETS_PRESETS.find(
    (preset) =>
      preset.light.primary === rawPrimary &&
      preset.light.secondary === rawSecondary &&
      preset.light.background === rawBackground
  );

  let finalPrimary = rawPrimary;
  let finalSecondary = rawSecondary;
  let finalBackground = rawBackground;
  let finalSidebar = rawSidebar;

  if (activePreset) {
    if (isDark) {
      finalPrimary = activePreset.dark.primary || activePreset.light.primary;
      finalSecondary =
        activePreset.dark.secondary || activePreset.light.secondary;
      finalBackground =
        activePreset.dark.background || activePreset.light.background;
      finalSidebar = activePreset.dark.sidebar || activePreset.light.sidebar;
    } else {
      finalPrimary = activePreset.light.primary;
      finalSecondary = activePreset.light.secondary;
      finalBackground = activePreset.light.background;
      finalSidebar = activePreset.light.sidebar;
    }
  }

  // Inject variables as raw inputs for the CSS relative OKLCH engine
  if (finalPrimary && finalPrimary !== "#e0531b" && finalPrimary !== "") {
    html.style.setProperty("--raw-primary", finalPrimary);
  } else {
    html.style.removeProperty("--raw-primary");
  }

  if (finalSecondary && finalSecondary !== "#f1f3f5" && finalSecondary !== "") {
    html.style.setProperty("--raw-secondary", finalSecondary);
  } else {
    html.style.removeProperty("--raw-secondary");
  }

  if (
    finalBackground &&
    finalBackground !== "#faf8f5" &&
    finalBackground !== ""
  ) {
    html.style.setProperty("--raw-background", finalBackground);
  } else {
    html.style.removeProperty("--raw-background");
  }

  if (finalSidebar && finalSidebar !== "") {
    html.style.setProperty("--raw-sidebar", finalSidebar);
  } else {
    html.style.removeProperty("--raw-sidebar");
  }

  // Cleanup legacy properties
  html.style.removeProperty("--primary");
  html.style.removeProperty("--secondary");
  html.style.removeProperty("--background");
  html.style.removeProperty("--paper");
  html.style.removeProperty("--sidebar");
  html.style.removeProperty("--sidebar-foreground");
  html.style.removeProperty("--sidebar-border");
  html.style.removeProperty("--sidebar-accent");
  html.style.removeProperty("--sidebar-accent-foreground");
}

export function applyAccessibility(
  contrast: "normal" | "high",
  colorBlind: "none" | "protanopia" | "deuteranopia" | "tritanopia"
) {
  const html = document.documentElement;

  // Apply Contrast
  if (contrast === "high") {
    html.classList.add("theme-high-contrast");
    html.style.setProperty("--contrast", "1.4");
  } else {
    html.classList.remove("theme-high-contrast");
    const tenantContrast = html.dataset.tenantContrast || "1.0";
    if (tenantContrast === "1.0") {
      html.style.removeProperty("--contrast");
    } else {
      html.style.setProperty("--contrast", tenantContrast);
    }
  }

  // Apply Color Blindness
  html.classList.remove(
    "theme-protanopia",
    "theme-deuteranopia",
    "theme-tritanopia"
  );
  if (colorBlind !== "none") {
    html.classList.add(`theme-${colorBlind}`);
  }
}
