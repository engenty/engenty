/**
 * "Which plugins and accounts does this agent's Space offer?"
 *
 * An agent uses its Space's accounts — there is no per-agent grant. The
 * connections module registers the marketplace panel (one component, also used
 * from a space). This file is the slot: ai-ui cannot import the module
 * (cycle), so the panel is looked up on `globalThis` under a shared Symbol.
 */

import { Skeleton } from "@engenty/ui-core";
import { type ComponentType, useEffect, useState } from "react";

const AGENT_PLUGIN_PANEL_KEY = Symbol.for(
  "engenty.connections.plugin-marketplace-panel"
);

function readAgentPluginPanel() {
  const g = globalThis as Record<symbol, unknown>;
  return g[AGENT_PLUGIN_PANEL_KEY] as
    | ComponentType<{
        agentId?: string | null;
        detailsId?: string | null;
        onDetailsIdChange?: (id: string | null) => void;
        spaceId: string | null;
      }>
    | undefined;
}

export function AgentConnectionsPanel({
  agentId,
  detailsId,
  onDetailsIdChange,
  spaceId,
}: {
  /** Set when the agent's preferred-plugin list may be edited. */
  agentId?: string | null;
  detailsId?: string | null;
  onDetailsIdChange?: (id: string | null) => void;
  /** The agent's Space; null = the viewer's personal Space (Copilot). */
  spaceId: string | null;
}) {
  const [Panel, setPanel] = useState(readAgentPluginPanel);

  useEffect(() => {
    if (Panel) {
      return;
    }
    const found = readAgentPluginPanel();
    if (found) {
      setPanel(() => found);
      return;
    }
    const onReady = () => {
      const next = readAgentPluginPanel();
      if (next) {
        setPanel(() => next);
      }
    };
    globalThis.addEventListener("engenty-agent-plugin-panel", onReady);
    return () =>
      globalThis.removeEventListener("engenty-agent-plugin-panel", onReady);
  }, [Panel]);

  if (!Panel) {
    return (
      <div className="space-y-2 p-4" data-testid="agent-plugin-panel-waiting">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  return (
    <Panel
      agentId={agentId}
      detailsId={detailsId}
      onDetailsIdChange={onDetailsIdChange}
      spaceId={spaceId}
    />
  );
}
