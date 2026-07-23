import type { ViewMode } from "@engenty/ui-core";

export interface UsersColumnVisibility {
  createdAt: boolean;
  displayName: boolean;
  email: boolean;
  primaryTenant: boolean;
  role: boolean;
  superAdmin: boolean;
}

export type UsersSortColumn = "email" | "display_name" | "created_at";

export const USERS_LIST_DISPLAY_DEFAULTS = {
  viewMode: "table" as ViewMode,
  tableSize: "compact" as const,
  sortBy: "display_name" as UsersSortColumn,
  sortOrder: "asc" as const,
  pageSize: 25 as const,
  columnVisibility: {
    displayName: true,
    email: true,
    primaryTenant: true,
    role: true,
    superAdmin: true,
    createdAt: true,
  } satisfies UsersColumnVisibility,
  columnOrder: [
    "displayName",
    "email",
    "primaryTenant",
    "role",
    "superAdmin",
    "createdAt",
  ] as (keyof UsersColumnVisibility)[],
};
