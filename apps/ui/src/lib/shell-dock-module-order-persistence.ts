import {
  parseShellDockModuleOrderSnapshot,
  SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME,
  type ShellDockModuleOrderSnapshotV1,
} from "@engenty/app-shell";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useMemo } from "react";
import { getTenantSetting, setTenantSetting } from "@/lib/api/client";

/** Tenant-settings `shell.dock_module_order`: org-wide modules rail order. */

export function shellDockModuleOrderQueryKey(tenantId: string) {
  return [
    "tenant-settings",
    tenantId,
    SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME,
  ] as const;
}

export function shellDockModuleOrderQueryOptions(tenantId: string) {
  return queryOptions({
    queryKey: shellDockModuleOrderQueryKey(tenantId),
    queryFn: async ({
      signal,
    }): Promise<ShellDockModuleOrderSnapshotV1 | null> => {
      const res = await getTenantSetting(
        SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME,
        signal
      );
      if (!res || "error" in res) {
        return null;
      }
      if (
        res.type === "json" &&
        res.value != null &&
        typeof res.value === "object"
      ) {
        return parseShellDockModuleOrderSnapshot(res.value);
      }
      return null;
    },
  });
}

export interface UseShellDockModuleOrderPersistenceOptions {
  enabled: boolean;
  tenantId: string;
}

export function useShellDockModuleOrderPersistence(
  options: UseShellDockModuleOrderPersistenceOptions
) {
  const queryClient = useQueryClient();
  const queryKey = shellDockModuleOrderQueryKey(options.tenantId);
  const query = useQuery({
    ...shellDockModuleOrderQueryOptions(options.tenantId),
    enabled: options.enabled && options.tenantId.length > 0,
  });

  const setOrder = useCallback(
    (order: string[]) => {
      if (!(options.enabled && options.tenantId)) {
        return;
      }
      const nextSnapshot: ShellDockModuleOrderSnapshotV1 = {
        v: 1,
        order,
      };
      queryClient.setQueryData(queryKey, nextSnapshot);
      // Persist immediately — rearrange mode only saves once on exit.
      void setTenantSetting(SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME, {
        type: "json",
        value_jsonb: nextSnapshot,
      }).catch(() => {
        // Keep optimistic cache; next load will reconcile if the write failed.
      });
    },
    [options.enabled, options.tenantId, queryClient, queryKey]
  );

  const orderHydrated = !options.enabled || query.isFetched;
  const snapshot = query.data ?? null;

  return useMemo(
    () => ({
      snapshot,
      orderHydrated,
      setOrder,
    }),
    [snapshot, orderHydrated, setOrder]
  );
}
