import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AuditLogViewer } from "../components/audit-log-viewer.js";
import { useAuditLogLabels } from "../hooks/use-audit-log-labels.js";
import type { AuditLogFiltersParams } from "../lib/audit-api.js";
import { getAuditEvents, getAuditFilterOptions } from "../lib/audit-api.js";

function fetchEvents(
  tenantId: string | null,
  filters: AuditLogFiltersParams,
  page: number,
  signal?: AbortSignal
) {
  return getAuditEvents(
    {
      filters: {
        search: filters.search,
        types: filters.types,
        actor_id: filters.actor_id,
        module_id: filters.module_id,
        date_from: filters.date_from,
        date_to: filters.date_to,
      },
      page,
      limit: 50,
      tenantId,
    },
    signal
  ).then((r) => ({ events: r.events, has_more: r.has_more }));
}

export function TenantAuditLogsPage() {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const tenantId = currentTenant?.id ?? null;
  const labels = useAuditLogLabels(t);
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.auditLogs") },
    ],
    [moduleRootCrumb, t]
  );

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  const fetchEventsForTenant = useCallback(
    (filters: AuditLogFiltersParams, page: number, signal?: AbortSignal) =>
      fetchEvents(tenantId, filters, page, signal),
    [tenantId]
  );

  const fetchFilterOptionsForTenant = useCallback(
    (signal?: AbortSignal) => getAuditFilterOptions(tenantId, signal),
    [tenantId]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
    actions: (
      <Button
        className="h-8 w-8 p-0"
        onClick={handleRefresh}
        size="sm"
        variant="outline"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    ),
  });

  if (!tenantId) {
    return (
      <section className="p-page">
        <p className="text-muted-foreground text-sm">
          {t("plugins.tenantRequired")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-page">
      <AuditLogViewer
        fetchEvents={fetchEventsForTenant}
        fetchFilterOptions={fetchFilterOptionsForTenant}
        labels={labels}
        refreshTrigger={refreshTrigger}
      />
    </section>
  );
}
