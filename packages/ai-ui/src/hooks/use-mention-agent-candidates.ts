// Agent candidates for the composer @ picker — registry agents that are active
// and mention-routable. Shared by full-page chat and the drawer so both
// surfaces list Agents alongside People / workspace refs.

import { useMemo } from "react";
import {
  buildMentionAgentCandidates,
  type MentionAgentCandidateInput,
} from "../components/copilot/composer/copilot-agent-mention.js";
import { useAiAgentsQuery } from "../lib/admin/ai-runtime-queries.js";

export function useMentionAgentCandidates(): Array<{
  handle: string;
  id: string;
  name: string;
}> {
  const agentsQuery = useAiAgentsQuery(true);
  return useMemo(
    () =>
      buildMentionAgentCandidates(
        (agentsQuery.data?.agents ?? []) as MentionAgentCandidateInput[]
      ),
    [agentsQuery.data?.agents]
  );
}
