/** Tenant-settings JSON key — org-wide primary-rail modules order. */
export const SHELL_DOCK_MODULE_ORDER_TENANT_SETTING_NAME =
  "shell.dock_module_order";

export interface ShellDockModuleOrderSnapshotV1 {
  /** Ordered admin-menu / nav item ids for the modules rail section. */
  order: string[];
  v: 1;
}

/** Injected by the host (React Query + tenant-settings API). */
export interface ShellDockModuleOrderPersistenceApi {
  orderHydrated: boolean;
  setOrder: (order: string[]) => void;
  snapshot: ShellDockModuleOrderSnapshotV1 | null;
}

export type ShellDockModuleOrderPersistence =
  ShellDockModuleOrderPersistenceApi;

/** Hosts without tenant-settings wiring. */
export const SHELL_DOCK_MODULE_ORDER_NOOP: ShellDockModuleOrderPersistence = {
  snapshot: null,
  orderHydrated: true,
  setOrder: () => {},
};

export function createDefaultShellDockModuleOrderSnapshot(): ShellDockModuleOrderSnapshotV1 {
  return { order: [], v: 1 };
}

export function parseShellDockModuleOrderSnapshot(
  data: unknown
): ShellDockModuleOrderSnapshotV1 | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (o.v !== 1) {
    return null;
  }
  if (!Array.isArray(o.order)) {
    return null;
  }
  const order = o.order.filter((id): id is string => typeof id === "string");
  return { order, v: 1 };
}
