"use client";

import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import { useEngentyAIContext } from "../../agent-provider/engenty-ai-provider.js";
import { getAppsAiThreadUsage } from "./apps-ai-thread-usage-api.js";
import {
  formatCompactTokenCount,
  formatCopilotUsageLine,
  formatUsageCostMicros,
  sumThreadUsageTokens,
} from "./format-session-usage.js";

export function appsAiThreadUsageQueryKey(input: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    "apps-ai",
    "thread-usage",
    input.serviceBaseUrl,
    input.threadId,
  ] as const;
}

export function useCopilotThreadUsage(input: {
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  threadId: string | null;
}) {
  const ai = useEngentyAIContext();

  const query = useQuery({
    enabled: Boolean(
      ai.isTransportReady && input.threadId && ai.serviceBaseUrl
    ),
    queryKey: input.threadId
      ? appsAiThreadUsageQueryKey({
          serviceBaseUrl: ai.serviceBaseUrl,
          threadId: input.threadId,
        })
      : ["apps-ai", "thread-usage", "idle"],
    queryFn: ({ signal }) =>
      getAppsAiThreadUsage(ai.serviceBaseUrl, input.threadId!, signal),
    staleTime: 5000,
  });

  const line = useMemo(() => {
    const usage = query.data?.usage;
    if (!usage) {
      return null;
    }
    const tokens = sumThreadUsageTokens(usage);
    const tokenLabel = `${formatCompactTokenCount(tokens)} tokens`;
    const costLabel = formatUsageCostMicros(usage.cost_micros, usage.currency);
    return formatCopilotUsageLine({ costLabel, tokenLabel });
  }, [query.data?.usage]);

  return {
    isLoading: query.isLoading || query.isFetching,
    line,
    usage: query.data?.usage ?? null,
  };
}
