import { useQuery } from "@engenty/query-client";
import {
  getAgentDeskFeed,
  getAgentDeskGeneratedStarters,
} from "./agent-desk-api.js";

export const agentDeskKeys = {
  feed: (spaceId: string | null, agentId: string, locale: string) =>
    ["agent-desk", "feed", spaceId ?? "", agentId, locale] as const,
  generatedStarters: (spaceId: string, agentId: string, locale: string) =>
    ["agent-desk", "starters", spaceId, agentId, locale] as const,
};

export function useAgentDeskFeed(input: {
  agentId: string;
  enabled?: boolean;
  locale: string;
  /** Null for the copilot's desk outside a space (service `buildSpacelessDeskFeed`). */
  spaceId: string | null;
}) {
  return useQuery({
    enabled: (input.enabled ?? true) && Boolean(input.agentId),
    queryFn: ({ signal }) =>
      getAgentDeskFeed(
        {
          agent_id: input.agentId,
          locale: input.locale,
          space_id: input.spaceId,
        },
        signal
      ),
    queryKey: agentDeskKeys.feed(input.spaceId, input.agentId, input.locale),
  });
}

export function useAgentDeskGeneratedStarters(input: {
  agentId: string;
  enabled?: boolean;
  locale: string;
  spaceId: string;
}) {
  return useQuery({
    enabled: (input.enabled ?? true) && Boolean(input.agentId && input.spaceId),
    queryFn: ({ signal }) =>
      getAgentDeskGeneratedStarters(
        {
          agent_id: input.agentId,
          locale: input.locale,
          space_id: input.spaceId,
        },
        signal
      ),
    queryKey: agentDeskKeys.generatedStarters(
      input.spaceId,
      input.agentId,
      input.locale
    ),
    retry: false,
    staleTime: 60_000,
  });
}
