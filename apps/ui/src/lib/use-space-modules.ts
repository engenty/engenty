/**
 * The modules mounted into a space, as labelled, reachable entries.
 *
 * Lives in a hook rather than in a page because the space's modules are NOT a
 * destination — they are navigation. A grid of cards duplicating the rail was a
 * page you passed through to get somewhere else, so the list moved into the
 * space sidebar and the tab was deleted. The logic below is unchanged.
 *
 * "Module", not "app": what a person calls an app in this product is an
 * ARTIFACT they interact with (a board, a table), while these are the mounts
 * the sidebar lists under MODULE (PLAN-space-home.md H9).
 *
 * Reads the space's SURFACE, not the installed plugin list: what a space
 * contains is decided by its mounts (PLAN-spaces.md Phase 3), and showing every
 * installed module would make the mount set look decorative.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  type UiIconComponent,
  useUiContributions,
} from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { spaceTabModuleId } from "@/lib/space-nav";
import { MODULE_ROUTE_PREFIX } from "@/lib/space-route-mirrors";
import {
  useSpaceSetupCatalogQuery,
  useSpaceSurfaceQuery,
} from "@/lib/spaces-queries";

export interface SpaceModule {
  /** The rail's icon for this module, when it has a rail row to borrow one from. */
  icon?: UiIconComponent;
  id: string;
  /**
   * This module contributes a COPILOT APP — it is an assistant you talk to,
   * not a records module you browse. The space sidebar lists those above the
   * module list rather than alphabetised inside it.
   */
  isAssistant: boolean;
  label: string;
}

export interface UseSpaceModulesResult {
  isPending: boolean;
  modules: SpaceModule[];
}

export function useSpaceModules(spaceId: string | null): UseSpaceModulesResult {
  const { t } = useTranslation("common");
  const { contributions } = useUiContributions();
  const surfaceQuery = useSpaceSurfaceQuery(spaceId);
  // Display names for every mountable module, from the same catalog the setup
  // dialog reads. Needed because not every module has a rail menu row to borrow
  // a label from — the copilot's is built separately — and "engenty-copilot" is
  // an id, not a name.
  const catalogQuery = useSpaceSetupCatalogQuery();

  /**
   * Reachability comes from the ROUTES; the label from the setup catalog, with
   * the rail's translated menu label preferred where one exists.
   *
   * Two different questions, and answering both from the menu items was wrong:
   * the copilot's rail entry is built separately (`copilotNavItems` in
   * `navigation.ts`), so a menu-only lookup dropped chat from every space even
   * though it is a baseline mount. Routes are the honest test of "can this
   * module be opened at all" — a mount naming a UI-less module (a sync worker)
   * registers none and is still correctly skipped.
   */
  const modules = useMemo(() => {
    const reachable = new Set<string>();
    for (const route of contributions.routes) {
      if (route.path.startsWith(MODULE_ROUTE_PREFIX)) {
        const moduleId = route.path
          .slice(MODULE_ROUTE_PREFIX.length)
          .split("/")[0];
        if (moduleId) {
          reachable.add(moduleId);
        }
      }
    }
    const labelByModuleId = new Map<string, string>();
    const iconByModuleId = new Map<string, UiIconComponent>();
    const assistantModuleIds = new Set<string>();
    for (const module of catalogQuery.data?.modules ?? []) {
      labelByModuleId.set(module.id, module.name);
    }
    // The copilot's rail entry is a COPILOT APP, not an admin-menu item, so the
    // loop below never saw it and it rendered label-only with no icon. Its
    // contribution carries one; the plugin id is the module id.
    for (const app of contributions.copilotApps) {
      assistantModuleIds.add(app.pluginId);
      if (app.icon) {
        iconByModuleId.set(app.pluginId, app.icon);
      }
      labelByModuleId.set(
        app.pluginId,
        app.labelKey ? t(app.labelKey, { defaultValue: app.label }) : app.label
      );
    }
    for (const item of contributions.adminMenuItems) {
      const path = item.to ?? "";
      if (path.startsWith(MODULE_ROUTE_PREFIX)) {
        const moduleId = path.slice(MODULE_ROUTE_PREFIX.length).split("/")[0];
        if (moduleId) {
          if (item.icon) {
            iconByModuleId.set(moduleId, item.icon);
          }
          // The menu label wins over the catalog name: it is the translated
          // string the user already reads on the rail.
          labelByModuleId.set(
            moduleId,
            item.labelKey
              ? t(item.labelKey, { defaultValue: item.label ?? moduleId })
              : (item.label ?? moduleId)
          );
        }
      }
    }
    return (surfaceQuery.data?.modules ?? [])
      .filter((mount) => reachable.has(mount.moduleId))
      .map((mount) => ({
        icon: iconByModuleId.get(mount.moduleId),
        id: mount.moduleId,
        isAssistant: assistantModuleIds.has(mount.moduleId),
        label: labelByModuleId.get(mount.moduleId) ?? mount.moduleId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    catalogQuery.data,
    contributions.adminMenuItems,
    contributions.copilotApps,
    contributions.routes,
    surfaceQuery.data,
    t,
  ]);

  return { modules, isPending: surfaceQuery.isPending };
}

/**
 * The mounts a person actually reads as "Module": the space's mounts minus the
 * two kinds that already have a home elsewhere — a module that owns a space tab
 * (listing it twice is the duplication the sidebar exists to remove) and an
 * assistant module (Copilot has a root-level home; hired engenties are the roster).
 *
 * Shared by the sidebar's Modules section and the home's Module column so the
 * two cannot disagree about what this Space contains.
 */
export function useSpaceListedModules(
  spaceId: string | null
): UseSpaceModulesResult {
  const { contributions } = useUiContributions();
  const { modules, isPending } = useSpaceModules(spaceId);
  const listed = useMemo(() => {
    const mountedIds = new Set(modules.map((module) => module.id));
    const promoted = new Set(
      (contributions.spaceTabs ?? [])
        .map((tab) => spaceTabModuleId(tab))
        .filter((moduleId) => mountedIds.has(moduleId))
    );
    return modules.filter(
      (module) => !(module.isAssistant || promoted.has(module.id))
    );
  }, [contributions.spaceTabs, modules]);
  return { isPending, modules: listed };
}
