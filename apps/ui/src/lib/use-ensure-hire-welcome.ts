/**
 * A hired Engenty with no desk thread yet is silent — the home lists it as
 * Inactive. Ask the server to leave a first message so the card can show.
 */
import { postAgentDeskWelcome, spaceHomeQueryKey } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { useEffect, useRef } from "react";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";

export function useEnsureHireWelcome(input: {
  agents: readonly SpaceRosterAgent[];
  ready: boolean;
  spokenAgentIds: ReadonlySet<string>;
  spaceId: string | null;
}): void {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation("common");
  const attempted = useRef(new Set<string>());
  const locale = i18n.language || "en";

  useEffect(() => {
    attempted.current.clear();
  }, [input.spaceId]);

  useEffect(() => {
    const spaceId = input.spaceId;
    if (!(spaceId && input.ready)) {
      return;
    }
    for (const agent of input.agents) {
      if (agent.source !== "database") {
        continue;
      }
      if (input.spokenAgentIds.has(agent.id)) {
        continue;
      }
      if (attempted.current.has(agent.id)) {
        continue;
      }
      attempted.current.add(agent.id);
      void postAgentDeskWelcome({
        agent_id: agent.id,
        locale,
        space_id: spaceId,
      })
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: spaceHomeQueryKey(spaceId, null).slice(0, 3),
          })
        )
        .catch(() => {
          attempted.current.delete(agent.id);
        });
    }
  }, [
    input.agents,
    input.ready,
    input.spaceId,
    input.spokenAgentIds,
    locale,
    queryClient,
  ]);
}
