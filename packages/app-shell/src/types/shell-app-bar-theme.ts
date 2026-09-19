/**
 * "Theme ›" submenu on the app-bar context menu. The host owns the presets
 * and the persistence; app-shell only draws the list.
 */
export interface AppBarThemeOption {
  id: string;
  label: string;
  /** Colour dots drawn before the label, e.g. primary / secondary / canvas / rail. */
  swatches: readonly string[];
}

export interface AppBarThemeMenu {
  /** Id of the option in effect, or null when the colours match no preset. */
  current: string | null;
  onSelect: (id: string) => void;
  options: readonly AppBarThemeOption[];
}
