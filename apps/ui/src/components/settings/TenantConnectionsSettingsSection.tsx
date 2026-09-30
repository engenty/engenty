import { useConnectionsUsageQuery } from "@engenty/connections/ui/queries";
import { useTranslation } from "@engenty/i18n/ui";
import { CONNECTIONS_CATALOG_PATH } from "@engenty/plugin-sdk";
import { SettingsFormSection, Skeleton } from "@engenty/ui-core";
import { BlocksIcon, ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SettingsOverviewIcon } from "./SettingsOverviewIcon";

/**
 * The Organisation's connections at a glance — how many accounts its Spaces
 * and people hold (counts only) — linking to Setup → Connections.
 */
export function TenantConnectionsSettingsSection() {
  const { t } = useTranslation("common");
  const usageQuery = useConnectionsUsageQuery();

  const summary = useMemo(() => {
    const usage = usageQuery.data?.usage ?? [];
    return {
      accounts: usage.reduce((sum, row) => sum + row.account_count, 0),
      services: usage.filter((row) => row.account_count > 0).length,
    };
  }, [usageQuery.data]);

  const description = (() => {
    if (usageQuery.isPending) {
      return null;
    }
    if (summary.accounts === 0) {
      return t("settings.connections.emptyOverview");
    }
    return t("settings.connections.linkedOverview", {
      count: summary.accounts,
      services: summary.services,
    });
  })();

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.connections.overviewDescription")}
      title={t("settings.connections.title")}
    >
      <Link
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
        to={CONNECTIONS_CATALOG_PATH}
      >
        <SettingsOverviewIcon Icon={BlocksIcon} tone="moss" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {t("settings.connections.title")}
          </span>
          {description == null ? (
            <Skeleton className="mt-1 h-3 w-36" />
          ) : (
            <span className="truncate text-muted-foreground text-xs">
              {description}
            </span>
          )}
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40" />
      </Link>
    </SettingsFormSection>
  );
}
