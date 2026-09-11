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
import type {
  SpaceCatalogConnector,
  SpaceMount,
} from "@/lib/api/spaces-client";
import {
  useSpaceAgentCatalogQuery,
  useSpaceConnectorCatalogQuery,
  useSpaceSetupCatalogQuery,
  useSpaceSkillCatalogQuery,
} from "@/lib/spaces-queries";
import { FILE_CONNECTOR_IDS } from "./space-capability-recommendations";

export interface SpaceCatalogItem {
  category: string;
  /** Connector this account (or pending offer) belongs to. */
  connectorId?: string | null;
  description?: string | null;
  /** True when the connector can list/read files (Drive, local folder, S3). */
  hasFiles?: boolean;
  id: string;
  managedByModule?: string | null;
  /** Skill catalog `engenty_modules` — which apps this skill is for. */
  modules?: string[];
  name: string;
  /** Connector with no account yet — related, but not mountable. */
  needsConnect?: boolean;
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

/** One connected account, flattened out of the connector catalog (CN.3). */
export interface SpaceConnectionMeta {
  /** Display name of the connector it belongs to ("Gmail"). */
  connectorId: string;
  connectorName: string;
  hasFiles: boolean;
  id: string;
  /** The account as a person recognises it, or the connector as a last resort. */
  label: string;
  ownerUserId: string | null;
  sharing: "org" | "personal" | null;
}

/**
 * Accounts by connection id, so a mount row can name the mailbox rather than
 * the provider.
 *
 * Exported and shared with the picker on purpose: the settings page listing
 * mounts and the dialog choosing them must not label the same account two
 * different ways — that is exactly the confusion account-level mounts exist to
 * remove.
 */
export function connectionMetaById(
  connectors: readonly SpaceCatalogConnector[]
): Map<string, SpaceConnectionMeta> {
  const map = new Map<string, SpaceConnectionMeta>();
  for (const connector of connectors) {
    const connectorName = connector.title ?? connector.name ?? connector.id;
    const hasFiles = connectorHasFiles(connector);
    for (const connection of connector.connections ?? []) {
      const account =
        connection.display_name?.trim() ||
        connection.external_account?.trim() ||
        null;
      map.set(connection.id, {
        connectorId: connector.id,
        connectorName,
        hasFiles,
        id: connection.id,
        label: account ?? connectorName,
        ownerUserId: connection.owner_user_id ?? null,
        sharing: connection.sharing ?? null,
      });
    }
  }
  return map;
}

function connectorHasFiles(connector: SpaceCatalogConnector): boolean {
  if (FILE_CONNECTOR_IDS.has(connector.id)) {
    return true;
  }
  return (connector.actions ?? []).some((action) =>
    action.id.startsWith("files_")
  );
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
  connections: SpaceCatalogItem[];
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
  enabled = true,
  options: {
    /**
     * Whether the space being configured is somebody's PERSONAL space.
     *
     * Decision 7 (PLAN-spaces.md CN.1): personal accounts stay in the personal
     * space. A shared space is offered org accounts only — not because the
     * server would allow otherwise (the sharing clamp already refuses a
     * non-owner at execution), but because offering a mailbox that everyone in
     * the space would then be able to work with is a sharing act the picker
     * should not make casually available. Defaults to false, the stricter side.
     */
    isPersonal?: boolean;
  } = {}
): SpaceMountCatalog {
  const catalogQuery = useSpaceSetupCatalogQuery(enabled);
  const agentsQuery = useSpaceAgentCatalogQuery(enabled);
  const skillsQuery = useSpaceSkillCatalogQuery(enabled);
  const connectorsQuery = useSpaceConnectorCatalogQuery(enabled);

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

  /**
   * ACCOUNTS, not connectors (PLAN-spaces.md Phase CN.3).
   *
   * A mount grants what its key names, and the key is a connection row id. This
   * list used to offer connectors, so ticking "Gmail" granted the space every
   * Gmail account in the tenant — including a colleague's. The catalog already
   * carries the accounts the CALLER may see (org-shared plus their own), which
   * is exactly the right set to offer: you cannot mount a mailbox you cannot
   * see, and nothing here needs a second visibility rule to say so.
   *
   * The label is the account, because that is what the person is choosing
   * between — two rows reading "Gmail" would make the picker useless in the one
   * case it exists for.
   */
  const connections = useMemo(() => {
    const connectors = connectorsQuery.data ?? [];
    const accounts = [...connectionMetaById(connectors).values()]
      // Decision 7 — a shared space takes org accounts only. The catalog
      // has already limited this to accounts the CALLER may see, so what
      // is dropped here is only ever the caller's own personal ones.
      .filter((meta) => options.isPersonal || meta.sharing !== "personal")
      .map((meta) => ({
        category: "integrations",
        connectorId: meta.connectorId,
        description:
          meta.label === meta.connectorName ? null : meta.connectorName,
        hasFiles: meta.hasFiles,
        id: meta.id,
        name: meta.label,
      }));
    const connectedConnectors = new Set(
      accounts.map((account) => account.connectorId)
    );
    const pending = connectors
      .filter((connector) => !connectedConnectors.has(connector.id))
      .map((connector) => ({
        category: "integrations",
        connectorId: connector.id,
        description: connector.description ?? null,
        hasFiles: connectorHasFiles(connector),
        id: `connector:${connector.id}`,
        name: connector.title ?? connector.name ?? connector.id,
        needsConnect: true,
      }));
    return withMountedExtras([...accounts, ...pending], mounts, "connection");
  }, [connectorsQuery.data, mounts, options.isPersonal]);

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
    connections,
    isPending:
      catalogQuery.isPending ||
      agentsQuery.isPending ||
      skillsQuery.isPending ||
      connectorsQuery.isPending,
    lockedKeys,
    modules,
    skills,
  };
}
