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
  Switch,
} from "@engenty/ui-core";
import {
  type PluginCategory,
  pluginCategoryRank,
  useUiContributions,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { BoxIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { deactivatePlugin } from "@/lib/api/client";
import { isManageAppEnabled, MANAGE_MODULES_HREF } from "@/lib/manage-app";
import {
  pluginKeys,
  usePluginsListQuery,
  useTogglePluginFromListMutation,
} from "@/lib/plugins-queries";
import { cn } from "@/lib/utils";
import { useWorkspaceContextQuery } from "@/lib/workspace-context-query";
import { invalidateUiPluginContributions } from "@/plugins/ui-plugin-contributions-queries";
import {
  collectEnabledDependents,
  type PluginDependencyNode,
} from "./plugin-dependents";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "./SettingsOverviewIcon";

/** Core settings surfaces that are not module rows (hardcoded elsewhere in nav). */
const NON_MODULE_SETTINGS_PATHS = new Set([
  "/settings/profile",
  "/settings/ai",
  "/settings/connections",
]);

const EXIT_MS = 280;

type SettingsListCategory = PluginCategory | "other";

interface ModuleRow {
  category: SettingsListCategory;
  description?: string;
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  label: string;
  mandatory: boolean;
  order: number;
  pluginId: string;
  to: string;
}

function moduleRootFromPath(path: string): string | null {
  const match = path.match(/^\/mdl\/([^/]+)/);
  return match?.[1] ?? null;
}

export function TenantPluginsSettingsSection() {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const workspace = useWorkspaceContextQuery(true);
  const { contributions, ready } = useUiContributions();
  const handOffToManage =
    isManageAppEnabled() && workspace.data?.isSuperAdmin === true;
  const isAdmin =
    workspace.data?.isSuperAdmin === true ||
    workspace.data?.isTenantAdmin === true;
  const tenantId = currentTenant?.id ?? null;
  const queryClient = useQueryClient();
  const pluginsQuery = usePluginsListQuery(tenantId);
  const toggleMutation = useTogglePluginFromListMutation(tenantId);

  const [confirmRow, setConfirmRow] = useState<ModuleRow | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [exitingIds, setExitingIds] = useState(() => new Set<string>());
  const [removedIds, setRemovedIds] = useState(() => new Set<string>());
  const [frozenRows, setFrozenRows] = useState<ModuleRow[] | null>(null);

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

  const pluginMetaById = useMemo(() => {
    const map = new Map<
      string,
      {
        category?: PluginCategory;
        description?: string;
        enabled: boolean;
        mandatory: boolean;
      }
    >();
    for (const plugin of pluginsQuery.data ?? []) {
      map.set(plugin.id, {
        category: plugin.category,
        description: plugin.description,
        enabled: plugin.enabled,
        mandatory: plugin.mandatory === true,
      });
    }
    return map;
  }, [pluginsQuery.data]);

  /**
   * Same settings contributions as the Settings secondary sidebar — omit
   * technical plugins without a settings registration (those stay on
   * Setup → Plugins). Grouped by manifest `category`.
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

    const visible = contributions.settingsItems.filter(
      (item) =>
        !NON_MODULE_SETTINGS_PATHS.has(item.to) &&
        (isAdmin || item.requiresAdmin === false)
    );

    return visible.map((item): ModuleRow => {
      const meta = pluginMetaById.get(item.pluginId);
      const category = item.category ?? meta?.category ?? ("other" as const);
      return {
        id: item.id,
        pluginId: item.pluginId,
        to: item.to,
        label: item.labelKey ? t(item.labelKey) : item.label,
        description: meta?.description,
        enabled: meta?.enabled ?? true,
        mandatory: meta?.mandatory ?? false,
        icon: resolveIcon(item) ?? BoxIcon,
        category,
        order: item.order ?? 10_000,
      };
    });
  }, [
    contributions.adminMenuItems,
    contributions.settingsItems,
    isAdmin,
    pluginMetaById,
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
    const source = frozenRows ?? moduleRows;
    return source.filter((row) => !removedIds.has(row.id));
  }, [frozenRows, moduleRows, removedIds]);

  const groupedRows = useMemo(() => {
    const byCategory = new Map<SettingsListCategory, ModuleRow[]>();
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

  const isLoading = !ready || (workspace.isLoading && !workspace.data);

  const requestToggle = (row: ModuleRow, nextEnabled: boolean) => {
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
              {t("settings.plugins.noModules")}
            </p>
          </div>
        ) : (
          groupedRows.map((group) => (
            <div key={group.category}>
              <div className="bg-muted/30 px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {group.label}
              </div>
              <div className="divide-y divide-border">
                {group.rows.map((row) => {
                  const Icon = row.icon;
                  const exiting = exitingIds.has(row.id);
                  const busy = busyPluginId === row.pluginId;
                  return (
                    <div
                      className={cn(
                        "overflow-hidden transition-[opacity,max-height] duration-300 ease-out",
                        exiting ? "max-h-0 opacity-0" : "max-h-24 opacity-100"
                      )}
                      key={row.id}
                    >
                      <Link
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                        to={row.to}
                      >
                        <SettingsOverviewIcon
                          Icon={Icon}
                          tone={overviewIconToneForCategory(row.category)}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium text-foreground text-sm">
                            {row.label}
                          </span>
                          {row.description ? (
                            <span className="truncate text-muted-foreground text-xs">
                              {row.description}
                            </span>
                          ) : null}
                        </div>
                        {row.mandatory ? null : (
                          <div
                            className="relative z-10 shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                              }
                            }}
                            role="presentation"
                          >
                            <Switch
                              aria-label={
                                row.enabled
                                  ? t("plugins.deactivate", {
                                      context: "plugin",
                                    })
                                  : t("plugins.activate", {
                                      context: "plugin",
                                    })
                              }
                              checked={row.enabled && !exiting}
                              disabled={busy || exiting || cascadeBusy}
                              onCheckedChange={(checked) => {
                                requestToggle(row, checked);
                              }}
                              size="sm"
                            />
                          </div>
                        )}
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {handOffToManage ? (
          <a
            className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
            href={MANAGE_MODULES_HREF}
          >
            <BoxIcon className="size-3" />
            {t("settings.plugins.manageAll")}
          </a>
        ) : (
          <Link
            className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
            to="/setup/plugins"
          >
            <BoxIcon className="size-3" />
            {t("settings.plugins.manageAll")}
          </Link>
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
