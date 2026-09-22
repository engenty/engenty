/**
 * The same agent roster the Work-tab sidebar lists — hired and module
 * engenties mounted in this space. Shared with the `/s/<key>/agents` page
 * so the two surfaces cannot disagree about who is here. Copilot has its
 * own root-level home (rail + Work row), not a desk in this roster.
 */
import {
  type AgentEngentyKind,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import { registerAgentDisplayNames } from "@engenty/ai-ui";
import { useEffect, useMemo } from "react";
import { compareSpaceAgents, isSpaceRosterAgent } from "./space-agent-nav";
import {
  useSpaceAgentCatalogQuery,
  useSpaceMountsQuery,
  useSpaceSurfaceQuery,
} from "./spaces-queries";

export type SpaceRosterAgentRole =
  | "chat_surface"
  | "coordinator"
  | "copilot"
  | "delegated"
  | "external"
  | "specialist";

export type SpaceRosterAgentSource = "builtin" | "database" | "module";

export interface SpaceRosterAgent {
  /** Generated portrait storage key; blob silhouette when absent. */
  avatarUrl?: string | null;
  description?: string | null;
  engenty: AgentEngentyKind;
  id: string;
  managedByModule?: string | null;
  name: string;
  /** Who this agent reports to in this space — the agent id on its mount. */
  reportsTo?: string | null;
  /** That supervisor's display name, resolved against the same catalog. */
  reportsToName?: string | null;
  role?: SpaceRosterAgentRole;
  skillIds: string[];
  source?: SpaceRosterAgentSource | null;
}

function asRosterRole(
  role: string | undefined
): SpaceRosterAgentRole | undefined {
  if (
    role === "chat_surface" ||
    role === "coordinator" ||
    role === "copilot" ||
    role === "delegated" ||
    role === "external" ||
    role === "specialist"
  ) {
    return role;
  }
  return;
}

function asRosterSource(
  source: string | undefined
): SpaceRosterAgentSource | undefined {
  if (source === "builtin" || source === "database" || source === "module") {
    return source;
  }
  return;
}

export function useSpaceRosterAgents(spaceId: string | null): {
  agents: SpaceRosterAgent[];
  connectors: string[];
  isPending: boolean;
} {
  const surfaceQuery = useSpaceSurfaceQuery(spaceId);
  const catalogQuery = useSpaceAgentCatalogQuery(spaceId != null);
  // `reports_to` is a property of the MOUNT, not of the agent: the same agent
  // can report to different people in two spaces. The surface flattens mounts
  // to ids, so the relation is read from the mount rows.
  const mountsQuery = useSpaceMountsQuery(spaceId);

  // Transcript rows and the thread-context box are handed agent IDs by the
  // run, never names. Publishing the catalog here is what stops them from
  // rendering "Inbox.Overview" — the catalog is loaded on every space surface
  // anyway, and this is the one place all of them go through. An EFFECT, not
  // a memo: the registry is a store other components subscribe to, and
  // writing it mid-render is a setState on them while this one renders.
  useEffect(() => {
    registerAgentDisplayNames(
      (catalogQuery.data ?? []).map((agent) => [agent.id, agent.name] as const)
    );
  }, [catalogQuery.data]);

  const agents = useMemo(() => {
    const catalog = new Map(
      (catalogQuery.data ?? []).map((agent) => [agent.id, agent])
    );
    const reportsToByAgent = new Map(
      (mountsQuery.data ?? [])
        .filter((mount) => mount.resourceType === "agent")
        .map((mount) => [mount.resourceKey, mount.reportsTo ?? null])
    );
    const nameOf = (id: string) => catalog.get(id)?.name ?? id;
    return [...(surfaceQuery.data?.agents ?? [])]
      .map((id) => {
        const entry = catalog.get(id);
        const reportsTo = reportsToByAgent.get(id) ?? null;
        return {
          avatarUrl: entry?.avatarUrl ?? null,
          description: entry?.description,
          engenty: resolveAgentEngenty(id, entry?.engenty),
          id,
          managedByModule: entry?.managed_by_module,
          name: entry?.name ?? id,
          reportsTo,
          reportsToName: reportsTo ? nameOf(reportsTo) : null,
          role: asRosterRole(entry?.role),
          skillIds: entry?.skillIds ?? [],
          source: asRosterSource(entry?.source),
        };
      })
      .filter(isSpaceRosterAgent)
      .sort(compareSpaceAgents);
  }, [catalogQuery.data, mountsQuery.data, surfaceQuery.data?.agents]);

  return {
    agents,
    connectors: surfaceQuery.data?.connectors ?? [],
    isPending: surfaceQuery.isPending || catalogQuery.isPending,
  };
}
