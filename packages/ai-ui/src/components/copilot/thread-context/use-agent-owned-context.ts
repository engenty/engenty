// What the agent itself brings to the conversation — its skills, its
// MEMORY.md for this Space, the files it keeps at /home, the artefacts it
// owns — as the context box shows it beside a desk or room chat. The thread
// summary says what THIS conversation touched; this says what the agent
// carries into every one. Read from the endpoints that already serve the
// personnel file, so the card and the admin page never disagree.
"use client";

import { useMemo } from "react";
import { useOptionalAgentHostByKey } from "../../../agent-provider/engenty-agent.js";
import { useArtifactsListQuery } from "../../../artifacts/artifacts-api.js";
import { useAgentMemoryQuery } from "../../../features/agent-desk/use-agent-memory.js";
import { AGENT_HOME_MOUNT } from "../../../features/agents-workspace/use-agent-workspace-tab.js";
import { useWorkspaceTreeQuery } from "../../../lib/admin/agent-workspace-queries.js";
import { useAgentEffectiveCapabilitiesQuery } from "../../../lib/admin/effective-capabilities-api.js";

/** How many of each an agent's card lists before it stops being a card. */
export const AGENT_CONTEXT_MAX_ITEMS = 5;
const MEMORY_EXCERPT_CHARS = 160;

export type AgentSkillSource = "agent" | "default" | "space";

export interface AgentOwnedContext {
  agentId: string | null;
  artefacts: { id: string; title: string; type: string }[];
  enabled: boolean;
  files: { name: string; path: string; updatedAt: string | null }[];
  memory: { excerpt: string | null; hasMore: boolean } | null;
  skills: { id: string; source: AgentSkillSource }[];
  spaceId: string | null;
}

const EMPTY: AgentOwnedContext = {
  agentId: null,
  artefacts: [],
  enabled: false,
  files: [],
  memory: null,
  skills: [],
  spaceId: null,
};

export function hasOwnedContext(owned: AgentOwnedContext): boolean {
  return (
    owned.enabled &&
    (owned.skills.length > 0 ||
      owned.memory !== null ||
      owned.files.length > 0 ||
      owned.artefacts.length > 0)
  );
}

/** Desk and room hosts carry an engenty of the Space; the copilot's do not. */
function hostKeyHasOwnedContext(hostKey: string): boolean {
  return hostKey.startsWith("agent-desk:") || hostKey.startsWith("agent-room:");
}

function readSpaceId(scope: unknown): string | null {
  const value = (scope as { space_id?: unknown } | null)?.space_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function memoryExcerpt(text: string): {
  excerpt: string | null;
  hasMore: boolean;
} {
  const flat = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/^[-*]\s+/, "")
        .trim()
    )
    .filter(Boolean)
    .join(" · ");
  if (!flat) {
    return { excerpt: null, hasMore: false };
  }
  if (flat.length <= MEMORY_EXCERPT_CHARS) {
    return { excerpt: flat, hasMore: false };
  }
  const cut = flat.slice(0, MEMORY_EXCERPT_CHARS);
  const at = cut.lastIndexOf(" ");
  return {
    excerpt: `${(at > MEMORY_EXCERPT_CHARS / 2 ? cut.slice(0, at) : cut).trimEnd()}…`,
    hasMore: true,
  };
}

export function useAgentOwnedContext(hostKey: string): AgentOwnedContext {
  const host = useOptionalAgentHostByKey(hostKey);
  const enabled = hostKeyHasOwnedContext(hostKey) && Boolean(host);
  const agentId = enabled ? (host?.config.agentId ?? null) : null;
  const spaceId = enabled
    ? readSpaceId(host?.config.routeContext?.scope)
    : null;

  const capabilities = useAgentEffectiveCapabilitiesQuery({
    agentId,
    enabled,
    spaceId,
  });
  const memory = useAgentMemoryQuery({
    agentId: agentId ?? "",
    enabled: enabled && Boolean(spaceId),
    spaceId: spaceId ?? "",
  });
  const home = useWorkspaceTreeQuery(agentId ?? "", AGENT_HOME_MOUNT);
  const artefacts = useArtifactsListQuery("agent", agentId);

  return useMemo(() => {
    if (!(enabled && agentId)) {
      return EMPTY;
    }
    const skills: AgentOwnedContext["skills"] = [];
    const seen = new Set<string>();
    const push = (ids: readonly string[] | null, source: AgentSkillSource) => {
      for (const id of ids ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          skills.push({ id, source });
        }
      }
    };
    // The agent's own first — that is the order it is told to prefer.
    push(capabilities.data?.skills.agent ?? null, "agent");
    push(capabilities.data?.skills.default ?? null, "default");
    push(capabilities.data?.skills.space ?? null, "space");

    const files = [...(home.data?.files ?? [])]
      .filter((file) => !file.is_dir)
      .toSorted((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
      )
      .slice(0, AGENT_CONTEXT_MAX_ITEMS)
      .map((file) => ({
        name: file.name,
        path: file.path,
        updatedAt: file.updated_at,
      }));

    const owned = [...(artefacts.data ?? [])]
      .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, AGENT_CONTEXT_MAX_ITEMS)
      .map((row) => ({ id: row.id, title: row.title, type: row.type }));

    const stored = memory.data?.memory?.trim() ?? "";
    return {
      agentId,
      artefacts: owned,
      enabled: true,
      files,
      memory: stored ? memoryExcerpt(stored) : null,
      skills: skills.slice(0, AGENT_CONTEXT_MAX_ITEMS * 2),
      spaceId,
    };
  }, [
    agentId,
    artefacts.data,
    capabilities.data,
    enabled,
    home.data,
    memory.data,
    spaceId,
  ]);
}
