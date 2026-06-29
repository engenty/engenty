import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SortOrder,
  TableSize,
  ViewMode,
} from "./list-display-configurator.js";
import {
  LIST_PAGE_SIZE_DEFAULT,
  type ListPageSize,
  normalizeListPageSize,
} from "./list-page-size.js";

export interface ListDisplayState<
  TColumnKey extends string = string,
  TSortColumn extends string = string,
> {
  columnOrder: TColumnKey[];
  columnVisibility: Record<TColumnKey, boolean>;
  pageSize: ListPageSize;
  sortBy: TSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}

export interface UseListDisplayStateOptions {
  /** "localStorage" (default) persists across sessions; "sessionStorage" clears on tab close. */
  storage?: "localStorage" | "sessionStorage";
}

const STORAGE_PREFIX = "engenty.list-display.";

function getStorage(
  storage: "localStorage" | "sessionStorage"
): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return storage === "sessionStorage"
      ? window.sessionStorage
      : window.localStorage;
  } catch {
    return null;
  }
}

function loadStored<T>(
  key: string,
  storage: "localStorage" | "sessionStorage"
): Partial<T> | null {
  const s = getStorage(storage);
  if (!s) {
    return null;
  }
  try {
    const raw = s.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return null;
  }
}

function saveStored<T>(
  key: string,
  value: T,
  storage: "localStorage" | "sessionStorage"
): void {
  const s = getStorage(storage);
  if (!s) {
    return;
  }
  try {
    s.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded or private mode
  }
}

function mergeState<TColumnKey extends string, TSortColumn extends string>(
  defaults: Omit<ListDisplayState<TColumnKey, TSortColumn>, "pageSize"> & {
    pageSize?: ListPageSize;
  },
  stored: Partial<ListDisplayState<TColumnKey, TSortColumn>> | null,
  validSortColumns?: readonly TSortColumn[],
  validViewModes?: readonly ("table" | "cards" | "kanban")[]
): ListDisplayState<TColumnKey, TSortColumn> {
  if (!stored) {
    return {
      ...defaults,
      pageSize: normalizeListPageSize(
        defaults.pageSize ?? LIST_PAGE_SIZE_DEFAULT
      ),
    };
  }

  const columnVisibility = { ...defaults.columnVisibility };
  if (stored.columnVisibility && typeof stored.columnVisibility === "object") {
    for (const key of Object.keys(defaults.columnVisibility) as TColumnKey[]) {
      if (
        key in stored.columnVisibility &&
        typeof stored.columnVisibility[key] === "boolean"
      ) {
        columnVisibility[key] = stored.columnVisibility[key];
      }
    }
  }

  let columnOrder = defaults.columnOrder;
  if (Array.isArray(stored.columnOrder) && stored.columnOrder.length > 0) {
    const validKeys = new Set(
      Object.keys(defaults.columnVisibility) as TColumnKey[]
    );
    const fromStored = stored.columnOrder.filter((k): k is TColumnKey =>
      validKeys.has(k)
    );
    const appended = defaults.columnOrder.filter(
      (k) => !fromStored.includes(k)
    );
    columnOrder = [...fromStored, ...appended];
  }

  const sortBy =
    stored.sortBy != null &&
    (validSortColumns === undefined ||
      validSortColumns.includes(stored.sortBy as TSortColumn))
      ? (stored.sortBy as TSortColumn)
      : defaults.sortBy;

  const validModes = validViewModes ?? ["table", "cards"];
  const viewMode =
    stored.viewMode != null && validModes.includes(stored.viewMode)
      ? stored.viewMode
      : defaults.viewMode;

  return {
    viewMode,
    tableSize:
      stored.tableSize === "compact" || stored.tableSize === "normal"
        ? stored.tableSize
        : defaults.tableSize,
    pageSize: normalizeListPageSize(
      stored.pageSize ?? defaults.pageSize ?? LIST_PAGE_SIZE_DEFAULT
    ),
    sortBy,
    sortOrder:
      stored.sortOrder === "asc" || stored.sortOrder === "desc"
        ? stored.sortOrder
        : defaults.sortOrder,
    columnVisibility,
    columnOrder,
  };
}

export interface UseListDisplayStateParams<
  TColumnKey extends string,
  TSortColumn extends string,
> {
  defaults: Omit<ListDisplayState<TColumnKey, TSortColumn>, "pageSize"> & {
    pageSize?: ListPageSize;
  };
  options?: UseListDisplayStateOptions;
  storageKey: string;
  /** Optional: if provided, stored sortBy is only used when it's in this list. */
  validSortColumns?: readonly TSortColumn[];
  /** Optional: if provided, stored viewMode is only used when it's in this list. Enables "kanban" when included. */
  validViewModes?: readonly ("table" | "cards" | "kanban")[];
}

export function useListDisplayState<
  TColumnKey extends string,
  TSortColumn extends string,
>({
  storageKey,
  defaults,
  validSortColumns,
  validViewModes,
  options = {},
}: UseListDisplayStateParams<TColumnKey, TSortColumn>) {
  const { storage = "localStorage" } = options;
  const [state, setState] = useState<ListDisplayState<TColumnKey, TSortColumn>>(
    () => {
      const stored = loadStored<ListDisplayState<TColumnKey, TSortColumn>>(
        storageKey,
        storage
      );
      return mergeState(defaults, stored, validSortColumns, validViewModes);
    }
  );
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    saveStored(storageKey, state, storage);
  }, [storageKey, storage, state]);

  const setViewMode = useCallback((viewMode: ViewMode) => {
    setState((s) => ({ ...s, viewMode }));
  }, []);

  const setTableSize = useCallback((tableSize: TableSize) => {
    setState((s) => ({ ...s, tableSize }));
  }, []);

  const setSortBy = useCallback((sortBy: TSortColumn) => {
    setState((s) => ({ ...s, sortBy }));
  }, []);

  const setSortOrder = useCallback((sortOrder: SortOrder) => {
    setState((s) => ({ ...s, sortOrder }));
  }, []);

  const setColumnVisibility = useCallback(
    (columnVisibility: Record<TColumnKey, boolean>) => {
      setState((s) => ({ ...s, columnVisibility }));
    },
    []
  );

  const setColumnOrder = useCallback((columnOrder: TColumnKey[]) => {
    setState((s) => ({ ...s, columnOrder }));
  }, []);

  const setPageSize = useCallback((pageSize: ListPageSize) => {
    setState((s) => ({ ...s, pageSize }));
  }, []);

  return {
    ...state,
    setViewMode,
    setTableSize,
    setPageSize,
    setSortBy,
    setSortOrder,
    setColumnVisibility,
    setColumnOrder,
  };
}
