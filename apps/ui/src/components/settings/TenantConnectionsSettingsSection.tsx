import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { SettingsFormSection, Skeleton } from "@engenty/ui-core";
import { BlocksIcon, ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SettingsOverviewIcon } from "./SettingsOverviewIcon";

const CONNECTIONS_SETTINGS_PATH = "/settings/connections";

interface CatalogConnection {
  id: string;
  status: "active" | "error" | "revoked";
}

interface CatalogConnector {
  connections: CatalogConnection[];
  id: string;
  name: string;
}

interface ConnectionsCatalog {
  connectors: CatalogConnector[];
}

/** Same key as `@engenty/connections` `useConnectionsCatalogQuery`. */
function useConnectionsCatalogOverviewQuery() {
  return useQuery({
    queryKey: ["connections", "catalog"],
    queryFn: ({ signal }) =>
      requestApiJson<ConnectionsCatalog>(
        "/api/tools/connections_catalog/invoke",
        {
          body: { input: {} },
          method: "POST",
          signal,
        }
      ),
    staleTime: 30_000,
  });
}

export function TenantConnectionsSettingsSection() {
  const { t } = useTranslation("common");
  const catalogQuery = useConnectionsCatalogOverviewQuery();

  const summary = useMemo(() => {
    const connectors = catalogQuery.data?.connectors ?? [];
    const linked = connectors.filter((c) => c.connections.length > 0);
    const connectionCount = linked.reduce(
      (sum, c) => sum + c.connections.length,
      0
    );
    const errorCount = linked.reduce(
      (sum, c) =>
        sum + c.connections.filter((conn) => conn.status === "error").length,
      0
    );
    const names = linked.slice(0, 3).map((c) => c.name);
    return {
      connectionCount,
      errorCount,
      names,
      serviceCount: linked.length,
    };
  }, [catalogQuery.data]);

  const description = (() => {
    if (catalogQuery.isLoading && !catalogQuery.data) {
      return null;
    }
    if (summary.connectionCount === 0) {
      return t("settings.connections.emptyOverview");
    }
    const namesPart =
      summary.names.length > 0 ? ` · ${summary.names.join(", ")}` : "";
    const base = t("settings.connections.linkedOverview", {
      count: summary.connectionCount,
    });
    if (summary.errorCount > 0) {
      return `${base}${namesPart} · ${t("settings.connections.errorsOverview", {
        count: summary.errorCount,
      })}`;
    }
    return `${base}${namesPart}`;
  })();

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.connections.overviewDescription")}
      title={t("settings.connections.title")}
    >
      <Link
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
        to={CONNECTIONS_SETTINGS_PATH}
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
