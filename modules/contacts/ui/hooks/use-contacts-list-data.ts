import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import type { ContactType } from "../../src/schema/index.js";
import type { ContactListItem, ContactRole } from "../api.js";
import type { ContactsSortColumn } from "../components/contacts-display-dialog.js";
import { useContactsListQuery } from "../queries.js";

export function parseContactsListRoleFromSearchParam(
  raw: string | null
): ContactRole | "" {
  const v = raw?.trim();
  return v ? v : "";
}

export interface UseContactsListDataOptions {
  pageSize: number;
  /** From the same `useSearchParams()` instance that calls `setSearchParams` (avoids URL desync with NuqsAdapter + React Router). */
  roleFilter: ContactRole | "";
  sortBy: ContactsSortColumn;
  sortOrder: "asc" | "desc";
  typeFilter: ContactType | "";
}

export interface UseContactsListDataResult {
  entities: ContactListItem[];
  error: string | null;
  isLoading: boolean;
  loadEntities: () => Promise<void>;
  page: number;
  roleFilter: ContactRole | "";
  search: string;
  setPage: (value: number | ((prev: number) => number)) => void;
  setSearch: (value: string | null) => Promise<unknown>;
  total: number;
  typeFilter: ContactType | "";
}

export function useContactsListData(
  options: UseContactsListDataOptions,
  t: (key: string, opts?: { defaultValue?: string }) => string
): UseContactsListDataResult {
  const roleFilter = options.roleFilter;
  const typeFilter = options.typeFilter;

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useState(1);

  const params = {
    page,
    pageSize: options.pageSize,
    role: roleFilter || undefined,
    type: typeFilter || undefined,
    search: search.trim() || undefined,
    sortBy: options.sortBy,
    sortOrder: options.sortOrder,
    include_linked_invoice_counts: false as const,
  };

  const query = useContactsListQuery(params);
  const entities = query.data?.data ?? [];
  const total = query.data?.total ?? 0;
  const error =
    query.error == null
      ? null
      : query.error instanceof Error
        ? query.error.message
        : t("loadFailed");

  const loadEntities = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    entities,
    isLoading: query.isLoading,
    error,
    total,
    roleFilter,
    typeFilter,
    loadEntities,
    setSearch,
    setPage,
    search,
    page,
  };
}
