"use client";

import { useMemo } from "react";
import { useAgentHost } from "../../../agent-provider/engenty-agent.js";
import { useArtifactsListQuery } from "../../../artifacts/artifacts-api.js";
import { useCopilotThreadBinding } from "../../../copilot/copilot-thread-binding-provider.js";
import { useObjectWidgets } from "../../../objects/object-widget-registry.js";
import { buildThreadContextSummary } from "./thread-context-summary.js";
import type { ThreadContextSummary } from "./thread-context-types.js";

/**
 * Aggregates thread-scoped artefacts (API), connected objects, and sources
 * from the live copilot transcript. Empty when the thread has none of these.
 */
export function useThreadContextSummary(hostKey: string): ThreadContextSummary {
  const { activeThreadId } = useCopilotThreadBinding();
  const host = useAgentHost(hostKey);
  const threadId = activeThreadId?.trim() || null;
  const artifactsQuery = useArtifactsListQuery("thread", threadId);
  const widgets = useObjectWidgets();

  return useMemo(() => {
    const artefacts = (artifactsQuery.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
    }));
    return buildThreadContextSummary({
      artefacts,
      messages: host.copilotMessages,
      matchers: widgets,
    });
  }, [artifactsQuery.data, host.copilotMessages, widgets]);
}
