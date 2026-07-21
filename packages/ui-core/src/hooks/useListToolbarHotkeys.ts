import { type RefObject, useEffect, useRef } from "react";

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
  const onOpenFiltersRef = useRef(onOpenFilters);
  onOpenFiltersRef.current = onOpenFilters;
  const onNewItemRef = useRef(onNewItem);
  onNewItemRef.current = onNewItem;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.repeat) {
        return;
      }
      if (isInsideBlockingOverlay(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "n") {
        if (event.shiftKey) {
          return;
        }
        const newItem = onNewItemRef.current;
        if (!newItem) {
          return;
        }
        event.preventDefault();
        newItem();
        return;
      }

      if (key !== "f") {
        return;
      }

      if (event.shiftKey) {
        const openFilters = onOpenFiltersRef.current;
        if (!openFilters) {
          return;
        }
        event.preventDefault();
        openFilters();
        return;
      }

      const input = searchInputRef?.current;
      if (!input) {
        return;
      }
      event.preventDefault();
      input.focus();
      input.select();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, searchInputRef]);
}
