/**
 * What can be mounted in a space, per kind — one place, two callers.
 *
 * Both the create dialog (all four kinds at once) and the per-kind edit dialogs
 * ask the same four services the same question, and the answers need the same
 * three fixes each time: a category to group by, a row for anything already
 * mounted that the catalog no longer lists, and the baseline's locked keys.
 * Duplicating that per dialog is how the create flow and the edit flow start
 * disagreeing about which boxes are even lockable.
 */
import {
  PLUGIN_CATEGORIES,
  type SpaceResourceKind,
  spaceMountKey,
} from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import type { SpaceMount } from "@/lib/api/spaces-client";
import {
  useSpaceAgentCatalogQuery,
  useSpaceSetupCatalogQuery,
  useSpaceSkillCatalogQuery,
} from "@/lib/spaces-queries";

export interface SpaceCatalogItem {
  category: string;
  /** Plugins: the connector this row stands for. */
  connectorId?: string | null;
  description?: string | null;
  id: string;
  managedByModule?: string | null;
  /** Skill catalog `engenty_modules` — which apps this skill is for. */
  modules?: string[];
  name: string;
  /** Modules only: ids this module needs mounted alongside it. */
  requires?: string[];
  role?: string | null;
  source?: string | null;
}

/** The category a module's engentys belong to, so both grids read as one taxonomy. */
function agentCategory(
  agentId: string,
  managedByModule: string | null | undefined,
  moduleCategories: Map<string, string>
): string {
  const moduleId = managedByModule ?? agentId.split(".")[0] ?? "";
  return (
    moduleCategories.get(moduleId) ??
    (moduleId === "engenty" ? "engenty" : "other")
  );
}

/**
 * Add a row for anything the space already has that the catalog does not list.
 *
 * Without this an existing mount whose resource has since left the catalog — a
 * module the mountable-list heuristic now hides, an agent a module stopped
 * shipping — would be invisible, silently posted back on every save, and
 * impossible to remove from the only screen that removes mounts.
 */
function withMountedExtras(
  items: SpaceCatalogItem[],
  mounts: readonly SpaceMount[],
  resourceType: SpaceResourceKind
): SpaceCatalogItem[] {
  const known = new Set(items.map((item) => item.id));
  const extras = mounts
    .filter(
      (mount) =>
        mount.resourceType === resourceType && !known.has(mount.resourceKey)
    )
    .map((mount) => ({
      category: "other",
      id: mount.resourceKey,
      name: mount.resourceKey,
    }));
  return extras.length > 0 ? [...items, ...extras] : items;
}

export function byCategory(
  items: SpaceCatalogItem[]
): [string, SpaceCatalogItem[]][] {
  const groups = new Map<string, SpaceCatalogItem[]>();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  const rank = (category: string) => {
    const index = PLUGIN_CATEGORIES.indexOf(
      category as (typeof PLUGIN_CATEGORIES)[number]
    );
    return index === -1 ? PLUGIN_CATEGORIES.length : index;
  };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(
      ([category, list]) =>
        [category, [...list].sort((a, b) => a.name.localeCompare(b.name))] as [
          string,
          SpaceCatalogItem[],
        ]
    );
}

export interface SpaceMountCatalog {
  agents: SpaceCatalogItem[];
  isPending: boolean;
  /**
   * Keys the user may not untick.
   *
   * From the SERVER, not a constant compiled into the bundle: the baseline
   * already exists twice (SQL seeds it, plugin-sdk declares it, a test pins
   * them together) and a third copy shipped to browsers would be the one
   * nobody re-checks. An existing row's own `is_required` is honoured too, so
   * an install that seeds its own required mount locks it.
   */
  lockedKeys: ReadonlySet<string>;
  modules: SpaceCatalogItem[];
  skills: SpaceCatalogItem[];
}

/** Everything mountable, with the space's own mounts folded in. */
export function useSpaceMountCatalog(
  mounts: readonly SpaceMount[],
  enabled = true
): SpaceMountCatalog {
  const catalogQuery = useSpaceSetupCatalogQuery(enabled);
  const agentsQuery = useSpaceAgentCatalogQuery(enabled);
  const skillsQuery = useSpaceSkillCatalogQuery(enabled);

  const moduleCategories = useMemo(
    () =>
      new Map(
        (catalogQuery.data?.modules ?? []).map((module) => [
          module.id,
          module.category ?? "other",
        ])
      ),
    [catalogQuery.data?.modules]
  );

  const modules = useMemo(
    () =>
      withMountedExtras(
        (catalogQuery.data?.modules ?? []).map((module) => ({
          category: module.category ?? "other",
          description: module.description,
          id: module.id,
          name: module.name,
          requires: module.requires ?? [],
        })),
        mounts,
        "module"
      ),
    [catalogQuery.data?.modules, mounts]
  );

  const agents = useMemo(
    () =>
      withMountedExtras(
        (agentsQuery.data ?? []).map((agent) => ({
          category: agentCategory(
            agent.id,
            agent.managed_by_module,
            moduleCategories
          ),
          description: agent.description ?? null,
          id: agent.id,
          managedByModule: agent.managed_by_module ?? null,
          name: agent.name,
          role: agent.role ?? null,
          source: agent.source ?? null,
        })),
        mounts,
        "agent"
      ),
    [agentsQuery.data, moduleCategories, mounts]
  );

  const skills = useMemo(
    () =>
      withMountedExtras(
        (skillsQuery.data ?? []).map((skill) => ({
          category: skill.category ?? skill.tier,
          description: skill.description,
          id: skill.name,
          modules: skill.engenty_modules ?? [],
          name: skill.title ?? skill.name,
          source: skill.source ?? null,
        })),
        mounts,
        "skill"
      ),
    [mounts, skillsQuery.data]
  );

  const lockedKeys = useMemo(() => {
    const keys = new Set(
      (catalogQuery.data?.baseline ?? []).map((mount) => spaceMountKey(mount))
    );
    for (const mount of mounts) {
      if (mount.isRequired) {
        keys.add(spaceMountKey(mount));
      }
    }
    return keys;
  }, [catalogQuery.data?.baseline, mounts]);

  return {
    agents,
    isPending:
      catalogQuery.isPending || agentsQuery.isPending || skillsQuery.isPending,
    lockedKeys,
    modules,
    skills,
  };
}
