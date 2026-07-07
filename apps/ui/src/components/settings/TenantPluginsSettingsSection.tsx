import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { BoxIcon, ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { PluginListItem } from "@/lib/api/client";
import { usePluginsListQuery } from "@/lib/plugins-queries";

/** Name prefix used by connection sub-modules (e.g. "Connections — Google"). */
const CONNECTION_DASH = "Connections —";

interface CollapsedPlugin {
  id: string;
  name: string;
  enabled: boolean;
  children?: string[];
}

function collapsePlugins(plugins: PluginListItem[]): CollapsedPlugin[] {
  // Platform modules that are effectively mandatory but not flagged as such
  const PLATFORM_MODULE_IDS = new Set([
    "engenty-coordinator",
    "files",
  ]);

  // 1. Filter out mandatory, packages, platform, and system plugins
  const userPlugins = plugins.filter((p) => {
    if (p.mandatory) return false;
    if (p.sourceType === "package") return false;
    if (PLATFORM_MODULE_IDS.has(p.id)) return false;
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

    // If this is the parent "Connections" module, merge its children
    if (displayName === "Connections") {
      const childNames = connectionChildren
        .map((c) => (c.name || c.id).replace(`${CONNECTION_DASH} `, "").trim())
        .sort();
      result.push({
        id: p.id,
        name: "Connections",
        enabled: p.enabled,
        children: childNames,
      });
    } else {
      result.push({
        id: p.id,
        name: displayName,
        enabled: p.enabled,
      });
    }
  }

  // If there were connection children but no parent "Connections" entry,
  // still show a collapsed group
  if (connectionChildren.length > 0 && !rest.some((p) => (p.name || p.id) === "Connections")) {
    const childNames = connectionChildren
      .map((c) => (c.name || c.id).replace(`${CONNECTION_DASH} `, "").trim())
      .sort();
    result.push({
      id: "connections-group",
      name: "Connections",
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

  const plugins = pluginsQuery.data ?? [];
  const isLoading = pluginsQuery.isLoading && !pluginsQuery.data;

  const collapsed = useMemo(() => collapsePlugins(plugins), [plugins]);

  return (
    <SettingsFormSection
      cardVariant="flush"
      description="Installed modules for your workspace."
      title="Modules"
    >
      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="flex items-center gap-3 px-4 py-3" key={i}>
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-4 w-40 flex-1" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))
        ) : collapsed.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No modules found.</p>
          </div>
        ) : (
          collapsed.map((plugin) => (
            <div
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              key={plugin.id}
            >
              <BoxIcon className="size-4 shrink-0 text-muted-foreground/60" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {plugin.name}
                </span>
                {plugin.children && plugin.children.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {plugin.children.join(", ")}
                  </span>
                )}
              </div>
              <Badge variant={plugin.enabled ? "default" : "secondary"} className="shrink-0">
                {plugin.enabled ? "Active" : "Inactive"}
              </Badge>
            </div>
          ))
        )}
        <Link
          className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          to="/admin/plugins"
        >
          <BoxIcon className="size-3" />
          Manage all plugins
        </Link>
      </div>
    </SettingsFormSection>
  );
}
