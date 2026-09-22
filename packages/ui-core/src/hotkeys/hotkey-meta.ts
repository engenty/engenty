import type {} from "@tanstack/hotkeys";

/**
 * Shared hotkey metadata for TanStack Hotkeys.
 *
 * `group` is a declaration-merge on HotkeyMeta so shortcut palettes can cluster
 * registrations without each package inventing its own field.
 */
export const HOTKEY_GROUP = {
  copilot: "Copilot",
  general: "General",
  lists: "Lists",
} as const;

export type HotkeyGroup = (typeof HOTKEY_GROUP)[keyof typeof HOTKEY_GROUP];

declare module "@tanstack/hotkeys" {
  interface HotkeyMeta {
    group?: string;
  }
}
