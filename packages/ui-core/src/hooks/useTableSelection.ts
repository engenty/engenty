import { useCallback, useEffect, useState } from "react";

export interface UseTableSelectionOptions<T extends { id: string }> {
  /** Optional filter to determine if an item is selectable */
  isSelectable?: (item: T) => boolean;
  /** Array of items that can be selected */
  items: T[];
}

export interface UseTableSelectionReturn {
  /** Whether all selectable items on the current page are selected */
  allSelected: boolean;
  /** Clear all selections */
  clearSelection: () => void;
  /** Handle select-all checkbox change */
  handleSelectAll: (checked: boolean | "indeterminate") => void;
  /** Handle individual item selection */
  handleSelectOne: (id: string, checked: boolean) => void;
  /** Set of currently selected item IDs */
  selectedIds: Set<string>;
  /** Whether some (but not all) selectable items are selected */
  someSelected: boolean;
}

/**
 * Hook for managing table row selection (multi-select).
 * Provides selectedIds, allSelected, someSelected, and handlers.
 * Does not perform deletion; modules wire their own bulk actions.
 */
export function useTableSelection<T extends { id: string }>(
  options: UseTableSelectionOptions<T>
): UseTableSelectionReturn {
  const { items, isSelectable } = options;

  const selectableItems = isSelectable ? items.filter(isSelectable) : items;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allSelected =
    selectableItems.length > 0 && selectedIds.size === selectableItems.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < selectableItems.length;

  const handleSelectAll = useCallback(
    (checked: boolean | "indeterminate") => {
      if (checked === true || checked === "indeterminate") {
        setSelectedIds(new Set(selectableItems.map((item) => item.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [selectableItems]
  );

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds.size]);

  return {
    selectedIds,
    allSelected,
    someSelected,
    handleSelectAll,
    handleSelectOne,
    clearSelection,
  };
}
