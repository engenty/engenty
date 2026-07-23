import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenuItem,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSortableHeader,
} from "@engenty/ui-core";
import { ExternalLink } from "lucide-react";
import { StatusBadge, TierBadge } from "@/components/tenant-badges";
import type { ManageTenant } from "@/lib/api/tenants";
import type {
  TenantsColumnVisibility,
  TenantsSortColumn,
} from "./tenants-list-display";

const COLUMN_TO_SORT: Partial<
  Record<keyof TenantsColumnVisibility, TenantsSortColumn>
> = {
  name: "name",
  createdAt: "created_at",
};

type TableSize = "compact" | "normal";

interface TenantsTableProps {
  columnOrder: (keyof TenantsColumnVisibility)[];
  columnVisibility: TenantsColumnVisibility;
  onRowClick: (tenant: ManageTenant) => void;
  onSortChange: (column: TenantsSortColumn) => void;
  sortBy: TenantsSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
  tenants: ManageTenant[];
}

export function TenantsTable({
  tenants,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  onSortChange,
  onRowClick,
}: TenantsTableProps) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";

  const labels: Record<keyof TenantsColumnVisibility, string> = {
    name: t("common.name"),
    slug: t("common.slug"),
    tier: t("tenants.fields.tier"),
    status: t("tenants.fields.status"),
    createdAt: t("common.created"),
  };

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<TenantsSortColumn>
                  column={sortColumn}
                  compact={compact}
                  key={key}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {labels[key]}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead className={compact ? "!py-1.5 h-8" : ""} key={key}>
                {labels[key]}
              </TableHead>
            );
          })}
          <TableHead
            className={`w-[40px] px-1 ${compact ? "!py-1.5 h-8" : ""}`}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((tenant) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
            key={tenant.id}
            onClick={() => onRowClick(tenant)}
          >
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              if (key === "tier") {
                return (
                  <TableCell key={key}>
                    <TierBadge tier={tenant.tier} />
                  </TableCell>
                );
              }
              if (key === "status") {
                return (
                  <TableCell key={key}>
                    <StatusBadge status={tenant.status} />
                  </TableCell>
                );
              }
              const val =
                key === "name"
                  ? tenant.name
                  : key === "slug"
                    ? tenant.slug
                    : tenant.created_at
                      ? new Date(tenant.created_at).toLocaleDateString()
                      : "-";
              return (
                <TableCell
                  className={
                    key === "name"
                      ? "font-medium"
                      : key === "slug"
                        ? "text-muted-foreground"
                        : undefined
                  }
                  key={key}
                >
                  {val}
                </TableCell>
              );
            })}
            <TableRowActions compact={compact}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRowClick(tenant);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("tenants.list.viewTenant")}
              </DropdownMenuItem>
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
