import type { ViewMode } from "@engenty/ui-core";

export interface TenantsColumnVisibility {
  createdAt: boolean;
  name: boolean;
  package: boolean;
  slug: boolean;
  status: boolean;
  tier: boolean;
}

export type TenantsSortColumn = "name" | "created_at";

export const TENANTS_LIST_DISPLAY_DEFAULTS = {
  viewMode: "table" as ViewMode,
  tableSize: "compact" as const,
  sortBy: "name" as TenantsSortColumn,
  sortOrder: "asc" as const,
  pageSize: 25 as const,
  columnVisibility: {
    name: true,
    slug: true,
    tier: true,
    status: true,
    package: true,
    createdAt: true,
  } satisfies TenantsColumnVisibility,
  columnOrder: [
    "name",
    "slug",
    "tier",
    "status",
    "package",
    "createdAt",
  ] as (keyof TenantsColumnVisibility)[],
};
