import { useMemo, useState } from "react";

export function useTeamSelection(
  items: Array<{ id: string }>,
  currentUserId: string | null
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableItems = useMemo(
    () => items.filter((item) => item.id !== currentUserId),
    [items, currentUserId]
  );
  const allSelected =
    selectableItems.length > 0 && selectedIds.size === selectableItems.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < selectableItems.length;

  const toggleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true || checked === "indeterminate") {
      setSelectedIds(new Set(selectableItems.map((item) => item.id)));
      return;
    }
    setSelectedIds(new Set());
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  return {
    selectedIds,
    allSelected,
    someSelected,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
  };
}
