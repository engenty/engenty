"use client";

import { useMemo } from "react";
import { useAgentDisplayNamesVersion } from "../../../ag-ui/agent-display-names.js";
import { useOptionalAgentHostByKey } from "../../../agent-provider/engenty-agent.js";
import { useArtifactsListQuery } from "../../../artifacts/artifacts-api.js";
import { useOptionalCopilotRiver } from "../../../copilot/copilot-river.js";
import { useObjectWidgets } from "../../../objects/object-widget-registry.js";
import {
  buildThreadContextSummary,
  spaceKeyFromPathname,
} from "./thread-context-summary.js";
import type { ThreadContextSummary } from "./thread-context-types.js";

/**
 * Aggregates thread-scoped artefacts (API), sub-agent runs, chat attachments,
 * connected objects, and sources from the live copilot transcript. Empty when
 * the thread has none of these.
 */
export function useThreadContextSummary(hostKey: string): ThreadContextSummary {
  // Desk, room, and the copilot all float this card. Only the copilot wraps
  // CopilotRiverProvider; only a mounted EngentyAgent has a host.
  // Requiring either one crashed the specialist desk (the card sits *around*
  // the chat host, not inside it).
  const river = useOptionalCopilotRiver();
  const host = useOptionalAgentHostByKey(hostKey);
  const threadId = host?.threadId?.trim() || river?.threadId?.trim() || null;
  const artifactsQuery = useArtifactsListQuery("thread", threadId);
  const widgets = useObjectWidgets();
  // The summary resolves agent NAMES while it builds. Those arrive with the
  // agent catalog, after the first run rows are already on screen, so the box
  // has to rebuild when one lands or it keeps showing the id.
  const agentNamesVersion = useAgentDisplayNamesVersion();
  const copilotMessages = host?.copilotMessages ?? [];
  const pendingUserParts = host?.pendingUserParts ?? [];

  return useMemo(() => {
    const artefacts = (artifactsQuery.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
    }));
    const pendingParts = pendingUserParts;
    const spaceKey =
      typeof window === "undefined"
        ? null
        : spaceKeyFromPathname(window.location.pathname);
    return buildThreadContextSummary({
      artefacts,
      matchers: widgets,
      messages: [
        ...copilotMessages,
        ...(pendingParts.length > 0
          ? [{ role: "user", parts: pendingParts }]
          : []),
      ],
      spaceKey,
      threadId,
    });
  }, [
    agentNamesVersion,
    artifactsQuery.data,
    copilotMessages,
    pendingUserParts,
    threadId,
    widgets,
  ]);
}
