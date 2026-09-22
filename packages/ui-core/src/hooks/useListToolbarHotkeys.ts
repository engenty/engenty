import { useHotkeys } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { HOTKEY_GROUP } from "../hotkeys/hotkey-meta";

export const LIST_TOOLBAR_HOTKEYS = {
  filters: "Mod+Shift+F",
  newItem: "Mod+N",
  search: "Mod+F",
} as const;

export interface UseListToolbarHotkeysOptions {
  /**
   * When false, list Mod shortcuts are left to the browser.
   * @default true
   */
  enabled?: boolean;
  /**
   * Opens the "new item" dialog/flow (Mod+N). Omit on screens without create.
   */
  onNewItem?: () => void;
  /**
   * Opens the list filter chip bar (Mod+Shift+F). Omit on toolbars without
   * an expandable filter row so the shortcut is not captured.
   */
  onOpenFilters?: () => void;
  /** List search field focused by Mod+F. Required for Mod+F to do anything. */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

function isInsideBlockingOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      '[role="dialog"], [role="alertdialog"], [data-slot="dialog-content"], [data-slot="sheet-content"]'
    )
  );
}

/**
 * List toolbar / list page shortcuts:
 * - Mod+F → focus (and select) the list search input
 * - Mod+Shift+F → open the filter chip bar (when `onOpenFilters` is provided)
 * - Mod+N → open the new-item dialog/flow (when `onNewItem` is provided)
 *
 * Mod is ⌘ on macOS and Ctrl elsewhere. Shortcuts are ignored while focus is
 * inside a dialog/sheet so modal forms keep native find/new-window behavior.
 *
 * Call from `ListSearchInput` (search/filter) and/or the list page (`onNewItem`).
 */
export function useListToolbarHotkeys(
  options: UseListToolbarHotkeysOptions
): void {
  const { searchInputRef, onOpenFilters, onNewItem, enabled = true } = options;

  useHotkeys(
    enabled
      ? [
          ...(searchInputRef
            ? [
                {
                  callback: (event: KeyboardEvent) => {
                    if (isInsideBlockingOverlay(event.target)) {
                      return;
                    }
                    const input = searchInputRef.current;
                    if (!input) {
                      return;
                    }
                    event.preventDefault();
                    input.focus();
                    input.select();
                  },
                  hotkey: LIST_TOOLBAR_HOTKEYS.search,
                  options: {
                    meta: {
                      description: "Focus and select the list search field",
                      group: HOTKEY_GROUP.lists,
                      name: "Focus list search",
                    },
                  },
                },
              ]
            : []),
          ...(onOpenFilters
            ? [
                {
                  callback: (event: KeyboardEvent) => {
                    if (isInsideBlockingOverlay(event.target)) {
                      return;
                    }
                    event.preventDefault();
                    onOpenFilters();
                  },
                  hotkey: LIST_TOOLBAR_HOTKEYS.filters,
                  options: {
                    meta: {
                      description: "Open the list filter chip bar",
                      group: HOTKEY_GROUP.lists,
                      name: "Open list filters",
                    },
                  },
                },
              ]
            : []),
          ...(onNewItem
            ? [
                {
                  callback: (event: KeyboardEvent) => {
                    if (isInsideBlockingOverlay(event.target)) {
                      return;
                    }
                    event.preventDefault();
                    onNewItem();
                  },
                  hotkey: LIST_TOOLBAR_HOTKEYS.newItem,
                  options: {
                    meta: {
                      description: "Open the new-item dialog",
                      group: HOTKEY_GROUP.lists,
                      name: "New item",
                    },
                  },
                },
              ]
            : []),
        ]
      : [],
    {
      conflictBehavior: "allow",
      preventDefault: false,
      stopPropagation: false,
    }
  );
}
