"use client";

import { useQueryClient } from "@engenty/query-client";
import { useEffect, useRef } from "react";
import { useAgentHost } from "../../agent-provider/engenty-agent.js";

/**
 * A turn can change who lives in the Space: `agent_propose` hires and mounts
 * a colleague mid-run, and the Space queries the sidebar, the roster page and
 * the `@` list read from have no way to hear about it — until this desk's run
 * settles. Refetch them then, so the new agent is there without a reload.
 *
 * Renders nothing; must sit inside the desk's `EngentyAgent`.
 */
export function AgentDeskRosterRefresh() {
  const queryClient = useQueryClient();
  const { status } = useAgentHost();
  const ranDuringTurn = useRef(false);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      ranDuringTurn.current = true;
      return;
    }
    if (!ranDuringTurn.current) {
      return;
    }
    ranDuringTurn.current = false;
    void queryClient.invalidateQueries({ queryKey: ["spaces"] });
  }, [queryClient, status]);

  return null;
}
