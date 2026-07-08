import { useTranslation } from "@engenty/i18n/ui";
import { Badge, SettingsFormSection, Skeleton } from "@engenty/ui-core";
import {
  useUiContributions,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { BoxIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { PluginListItem } from "@/lib/api/client";
import { usePluginsListQuery } from "@/lib/plugins-queries";

/** Name prefix used by connection sub-modules (e.g. "Connections — Google"). */
const CONNECTION_DASH = "Connections —";

/** Platform modules that are effectively mandatory but not flagged as such. */
const PLATFORM_MODULE_IDS = new Set(["engenty-coordinator", "files"]);

interface CollapsedPlugin {
  children?: string[];
  description?: string;
  enabled: boolean;
  id: string;
  name: string;
}

function collapsePlugins(plugins: PluginListItem[]): CollapsedPlugin[] {
  // 1. Filter out mandatory, packages, platform, and system plugins
  const userPlugins = plugins.filter((p) => {
    if (p.mandatory) {
      return false;
    }
    if (p.sourceType === "package") {
      return false;
    }
    if (PLATFORM_MODULE_IDS.has(p.id)) {
      return false;
    }
    return true;
  });

  // 2. Separate connection sub-modules from the rest
  const connectionChildren: PluginListItem[] = [];
  const rest: PluginListItem[] = [];

  for (const p of userPlugins) {
    const displayName = p.name || p.id;
    if (displayName.startsWith(CONNECTION_DASH)) {
      connectionChildren.push(p);
    } else {
      rest.push(p);
    }
  }

  // 3. Build collapsed list
  const result: CollapsedPlugin[] = [];

  for (const p of rest) {
    const displayName = p.name || p.id;

    if (displayName === "Connections") {
      const childNames = connectionChildren
        .map((c) => (c.name || c.id).replace(`${CONNECTION_DASH} `, "").trim())
        .sort();
      result.push({
        id: p.id,
        name: "Connections",
        description: p.description,
        enabled: p.enabled,
        children: childNames,
      });
    } else {
      result.push({
        id: p.id,
        name: displayName,
        description: p.description,
        enabled: p.enabled,
      });
    }
  }

  // If there were connection children but no parent "Connections" entry,
  // still show a collapsed group
  if (
    connectionChildren.length > 0 &&
    !rest.some((p) => (p.name || p.id) === "Connections")
  ) {
    const childNames = connectionChildren
      .map((c) => (c.name || c.id).replace(`${CONNECTION_DASH} `, "").trim())
      .sort();
    result.push({
      id: "connections-group",
      name: "Connections",
      description: connectionChildren[0]?.description,
      enabled: connectionChildren.some((c) => c.enabled),
      children: childNames,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function TenantPluginsSettingsSection() {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;
  const pluginsQuery = usePluginsListQuery(tenantId);
  const { contributions } = useUiContributions();

  const plugins = pluginsQuery.data ?? [];
  const isLoading = pluginsQuery.isLoading && !pluginsQuery.data;

  const collapsed = useMemo(() => collapsePlugins(plugins), [plugins]);

  // Build a map of pluginId → icon from module admin menu contributions
  const iconByPluginId = useMemo(() => {
    const map = new Map<string, React.ComponentType<{ className?: string }>>();
    for (const item of contributions.adminMenuItems) {
      if (item.icon && !map.has(item.pluginId)) {
        map.set(item.pluginId, item.icon);
      }
    }
    return map;
  }, [contributions.adminMenuItems]);

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
              <Skeleton className="h-5 w-14" />
            </div>
          ))
        ) : collapsed.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t("settings.plugins.noModules")}
            </p>
          </div>
        ) : (
          collapsed.map((plugin) => {
            const Icon = iconByPluginId.get(plugin.id) ?? BoxIcon;
            const description = plugin.children?.length
              ? plugin.children.join(", ")
              : plugin.description;

            return (
              <div
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                key={plugin.id}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-foreground text-sm">
                    {plugin.name}
                  </span>
                  {description && (
                    <span className="truncate text-muted-foreground text-xs">
                      {description}
                    </span>
                  )}
                </div>
                <Badge
                  className="shrink-0"
                  variant={plugin.enabled ? "default" : "secondary"}
                >
                  {plugin.enabled
                    ? t("plugins.enabled")
                    : t("plugins.disabled")}
                </Badge>
              </div>
            );
          })
        )}
        <Link
          className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          to="/admin/plugins"
        >
          <BoxIcon className="size-3" />
          {t("settings.plugins.manageAll")}
        </Link>
      </div>
    </SettingsFormSection>
  );
}
