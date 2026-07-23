import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, cn } from "@engenty/ui-core";
import type { ReactNode } from "react";
import { StatusBadge, TierBadge } from "@/components/tenant-badges";
import type { ManageTenant } from "@/lib/api/tenants";
import type { TenantsColumnVisibility } from "./tenants-list-display";

type TableSize = "compact" | "normal";

interface TenantsCardsProps {
  columnOrder: (keyof TenantsColumnVisibility)[];
  columnVisibility: TenantsColumnVisibility;
  onCardClick: (tenant: ManageTenant) => void;
  tableSize: TableSize;
  tenants: ManageTenant[];
}

export function TenantsCards({
  tenants,
  tableSize,
  columnOrder,
  columnVisibility,
  onCardClick,
}: TenantsCardsProps) {
  const { t } = useTranslation("common");
  const compact = tableSize === "compact";

  const fieldLabel = (key: keyof TenantsColumnVisibility) => {
    switch (key) {
      case "name":
        return t("common.name");
      case "slug":
        return t("common.slug");
      case "tier":
        return t("tenants.fields.tier");
      case "status":
        return t("tenants.fields.status");
      case "createdAt":
        return t("common.created");
      default:
        return key;
    }
  };

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {tenants.map((tenant) => {
        const bodyKeys = columnOrder.filter(
          (key) => key !== "name" && columnVisibility[key]
        );

        return (
          <button
            className={cn(
              "ui-canvas-raised w-full cursor-pointer rounded-lg border-0 text-left transition-[box-shadow,color]",
              compact ? "p-3" : "p-4"
            )}
            key={tenant.id}
            onClick={() => onCardClick(tenant)}
            type="button"
          >
            {columnVisibility.name ? (
              <h3 className="font-semibold leading-none tracking-tight">
                {tenant.name}
              </h3>
            ) : null}
            <div
              className={cn(
                "flex flex-col text-muted-foreground text-sm",
                columnVisibility.name
                  ? compact
                    ? "mt-2 gap-1"
                    : "mt-3 gap-2"
                  : compact
                    ? "gap-1"
                    : "gap-2"
              )}
            >
              {bodyKeys.map((key) => {
                let value: ReactNode;
                if (key === "slug") {
                  value = tenant.slug;
                } else if (key === "tier") {
                  value = <TierBadge tier={tenant.tier} />;
                } else if (key === "status") {
                  value = <StatusBadge status={tenant.status} />;
                } else {
                  value = tenant.created_at
                    ? new Date(tenant.created_at).toLocaleDateString()
                    : "-";
                }
                return (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={key}
                  >
                    <span>{fieldLabel(key)}</span>
                    <span className="text-foreground">{value}</span>
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
