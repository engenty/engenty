import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  SettingsFormSection,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import {
  pluginCategoryRank,
  useUiContributions,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { BoxIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deactivatePlugin } from "@/lib/api/client";
import {
  pluginKeys,
  usePluginsListQuery,
  useTogglePluginFromListMutation,
} from "@/lib/plugins-queries";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";
import { invalidateUiPluginContributions } from "@/plugins/ui-plugin-contributions-queries";
import { ModuleSettingsListRow } from "./module-settings-list-row";
import {
  buildModuleSettingsRows,
  filterModuleRows,
  type ModuleListFilter,
  type ModuleSettingsRow,
  type SettingsListCategory,
} from "./module-settings-rows";
import {
  collectEnabledDependents,
  type PluginDependencyNode,
} from "./plugin-dependents";

const EXIT_MS = 280;

function moduleRootFromPath(path: string): string | null {
  const match = path.match(/^\/mdl\/([^/]+)/);
  return match?.[1] ?? null;
}

export function TenantPluginsSettingsSection() {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const workspace = useWorkspaceContextQuery(true);
  const { contributions, ready } = useUiContributions();
  const isAdmin =
    workspace.data?.isSuperAdmin === true ||
    workspace.data?.isTenantAdmin === true;
  const tenantId = currentTenant?.id ?? null;
  const queryClient = useQueryClient();
  const pluginsQuery = usePluginsListQuery(tenantId);
  const toggleMutation = useTogglePluginFromListMutation(tenantId);

  const [listFilter, setListFilter] = useState<ModuleListFilter>("active");
  const [confirmRow, setConfirmRow] = useState<ModuleSettingsRow | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [exitingIds, setExitingIds] = useState(() => new Set<string>());
  const [removedIds, setRemovedIds] = useState(() => new Set<string>());
  const [frozenRows, setFrozenRows] = useState<ModuleSettingsRow[] | null>(
    null
  );

  const dependencyNodes = useMemo(
    (): PluginDependencyNode[] =>
      (pluginsQuery.data ?? []).map((plugin) => ({
        enabled: plugin.enabled,
        id: plugin.id,
        mandatory: plugin.mandatory === true,
        name: plugin.name || plugin.id,
        provides: plugin.provides ?? [],
        requires: plugin.requires ?? [],
      })),
    [pluginsQuery.data]
  );

  /**
   * Settings-item modules plus (for admins) disabled / mandatory catalog
   * plugins so All can turn them on without the old Setup → Plugins list.
   */
  const moduleRows = useMemo(() => {
    const resolveIcon = (
      item: (typeof contributions.settingsItems)[number]
    ) => {
      if (item.icon) {
        return item.icon;
      }
      const moduleRoot = moduleRootFromPath(item.to);
      if (!moduleRoot) {
        return;
      }
      const prefix = `/mdl/${moduleRoot}`;
      return contributions.adminMenuItems.find(
        (entry) =>
          entry.section === "modules" &&
          (entry.to === prefix || entry.to.startsWith(`${prefix}/`))
      )?.icon;
    };

    return buildModuleSettingsRows({
      fallbackIcon: BoxIcon,
      isAdmin,
      plugins: (pluginsQuery.data ?? []).map((plugin) => ({
        category: plugin.category,
        description: plugin.description,
        enabled: plugin.enabled,
        id: plugin.id,
        kind: plugin.kind,
        mandatory: plugin.mandatory === true,
        name: plugin.name || plugin.id,
        rootDir: plugin.rootDir,
        sourceType: plugin.sourceType,
      })),
      resolveIcon,
      settingsItems: contributions.settingsItems.map((item) => ({
        category: item.category,
        id: item.id,
        label: item.labelKey ? t(item.labelKey) : item.label,
        order: item.order,
        pluginId: item.pluginId,
        requiresAdmin: item.requiresAdmin,
        to: item.to,
      })),
    });
  }, [
    contributions.adminMenuItems,
    contributions.settingsItems,
    isAdmin,
    pluginsQuery.data,
    t,
  ]);

  const confirmDependents = useMemo(() => {
    if (!confirmRow) {
      return [];
    }
    return collectEnabledDependents(confirmRow.pluginId, dependencyNodes);
  }, [confirmRow, dependencyNodes]);

  const confirmBlockedByMandatory = useMemo(
    () => confirmDependents.some((dependent) => dependent.mandatory),
    [confirmDependents]
  );

  const labelForPluginId = (pluginId: string) => {
    const row = moduleRows.find((item) => item.pluginId === pluginId);
    if (row) {
      return row.label;
    }
    return (
      dependencyNodes.find((plugin) => plugin.id === pluginId)?.name ?? pluginId
    );
  };

  // Drop local suppressions once contributions no longer include the row.
  useEffect(() => {
    if (removedIds.size === 0 && frozenRows == null) {
      return;
    }
    const stillPresent = new Set(moduleRows.map((row) => row.id));
    setRemovedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (stillPresent.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (
      frozenRows?.every(
        (row) => !(removedIds.has(row.id) && stillPresent.has(row.id))
      )
    ) {
      setFrozenRows(null);
    }
  }, [frozenRows, moduleRows, removedIds]);

  const visibleRows = useMemo(() => {
    const source =
      listFilter === "all" ? moduleRows : (frozenRows ?? moduleRows);
    const unsuppressed =
      listFilter === "all"
        ? source
        : source.filter((row) => !removedIds.has(row.id));
    return filterModuleRows(unsuppressed, listFilter);
  }, [frozenRows, listFilter, moduleRows, removedIds]);

  const groupedRows = useMemo(() => {
    const byCategory = new Map<SettingsListCategory, ModuleSettingsRow[]>();
    for (const row of visibleRows) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }
    const categories = [...byCategory.keys()].sort(
      (left, right) => pluginCategoryRank(left) - pluginCategoryRank(right)
    );
    return categories.map((category) => ({
      category,
      label: t(`settings.categories.${category}`),
      rows: (byCategory.get(category) ?? []).sort(
        (left, right) => left.order - right.order
      ),
    }));
  }, [t, visibleRows]);

  const busyPluginId =
    cascadeBusy || toggleMutation.isPending
      ? (toggleMutation.variables?.pluginId ?? confirmRow?.pluginId ?? null)
      : null;

  const isLoading =
    !ready ||
    (workspace.isLoading && !workspace.data) ||
    (listFilter === "all" && pluginsQuery.isLoading && !pluginsQuery.data);

  const requestToggle = (row: ModuleSettingsRow, nextEnabled: boolean) => {
    if (row.mandatory || busyPluginId === row.pluginId) {
      return;
    }
    if (!nextEnabled) {
      setConfirmRow(row);
      return;
    }
    toggleMutation.mutate(
      { pluginId: row.pluginId, currentlyEnabled: row.enabled },
      {
        onError: () => {
          toast.error(t("plugins.updateStateFailed"));
        },
        onSuccess: (response) => {
          if (response.restartRequired) {
            toast.message(response.message);
          }
        },
      }
    );
  };

  const confirmDeactivate = () => {
    const row = confirmRow;
    if (!row || confirmBlockedByMandatory || cascadeBusy) {
      return;
    }
    const dependents = confirmDependents;
    const snapshot = frozenRows ?? moduleRows;
    const deactivateIds = [...dependents.map((d) => d.id), row.pluginId];
    const exitRowIds = moduleRows
      .filter((item) => deactivateIds.includes(item.pluginId))
      .map((item) => item.id);

    setConfirmRow(null);
    setCascadeBusy(true);

    void (async () => {
      try {
        let restartRequired = false;
        let restartMessage: string | undefined;
        for (const pluginId of deactivateIds) {
          const response = await deactivatePlugin(pluginId, tenantId);
          if (response.restartRequired) {
            restartRequired = true;
            restartMessage = response.message;
          }
        }
        await queryClient.invalidateQueries({
          queryKey: pluginKeys.list(tenantId),
        });
        await invalidateUiPluginContributions(queryClient);
        if (restartRequired && restartMessage) {
          toast.message(restartMessage);
        }
        if (listFilter === "all") {
          return;
        }
        setFrozenRows(snapshot);
        setExitingIds((prev) => {
          const next = new Set(prev);
          for (const id of exitRowIds) {
            next.add(id);
          }
          return next;
        });
        window.setTimeout(() => {
          setRemovedIds((prev) => {
            const next = new Set(prev);
            for (const id of exitRowIds) {
              next.add(id);
            }
            return next;
          });
          setExitingIds((prev) => {
            const next = new Set(prev);
            for (const id of exitRowIds) {
              next.delete(id);
            }
            return next;
          });
        }, EXIT_MS);
      } catch {
        toast.error(t("plugins.updateStateFailed"));
      } finally {
        setCascadeBusy(false);
      }
    })();
  };

  return (
    <SettingsFormSection
      cardVariant="flush"
      description={t("settings.plugins.description")}
      title={t("settings.plugins.title")}
      titleAction={
        <Tabs
          className="gap-0"
          onValueChange={(value) => {
            if (value === "active" || value === "all") {
              setListFilter(value);
            }
          }}
          value={listFilter}
        >
          <TabsList
            aria-label={t("settings.plugins.filterAriaLabel")}
            className="h-7"
          >
            <TabsTrigger className="h-6 px-2.5 text-xs" value="active">
              {t("settings.plugins.showActive")}
            </TabsTrigger>
            <TabsTrigger className="h-6 px-2.5 text-xs" value="all">
              {t("settings.plugins.showAll")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="flex items-center gap-3 px-4 py-3" key={i}>
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
              <Skeleton className="size-4" />
            </div>
          ))
        ) : groupedRows.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              {listFilter === "active"
                ? t("settings.plugins.noActiveModules")
                : t("settings.plugins.noModules")}
            </p>
          </div>
        ) : (
          groupedRows.map((group) => (
            <div key={group.category}>
              <div className="bg-muted/30 px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {group.label}
              </div>
              <div className="divide-y divide-border">
                {group.rows.map((row) => (
                  <ModuleSettingsListRow
                    activateLabel={t("plugins.activate", { context: "plugin" })}
                    busy={busyPluginId === row.pluginId || cascadeBusy}
                    deactivateLabel={t("plugins.deactivate", {
                      context: "plugin",
                    })}
                    exiting={exitingIds.has(row.id)}
                    key={row.id}
                    mandatoryLabel={t("settings.plugins.mandatoryBadge")}
                    onToggle={(checked) => {
                      requestToggle(row, checked);
                    }}
                    row={row}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRow(null);
          }
        }}
        open={confirmRow != null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.plugins.deactivateConfirmTitle", {
                name: confirmRow?.label ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.plugins.deactivateConfirmDescription")}
            </AlertDialogDescription>
            {confirmDependents.length > 0 ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium text-foreground">
                  {confirmBlockedByMandatory
                    ? t("settings.plugins.deactivateBlockedByDependents")
                    : t("settings.plugins.deactivateDependentsWarning")}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {confirmDependents.map((dependent) => (
                    <li key={dependent.id}>
                      {labelForPluginId(dependent.id)}
                      {dependent.mandatory
                        ? ` (${t("settings.plugins.mandatoryBadge")})`
                        : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBlockedByMandatory || cascadeBusy}
              onClick={confirmDeactivate}
            >
              {confirmDependents.length > 0 && !confirmBlockedByMandatory
                ? t("settings.plugins.deactivateConfirmActionWithDependents")
                : t("settings.plugins.deactivateConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsFormSection>
  );
}
