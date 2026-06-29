"use client";

import { useMemo } from "react";
import { useEngentyAIContext } from "../../agent-provider/engenty-ai-provider.js";
import {
  appsAiCopilotAppsAiQueryKeys,
  appsAiCopilotModulePanelQueryKeys,
} from "./apps-ai-copilot-query-keys.js";

export interface UseEngentyAiCopilotSessionQueriesOptions {
  agentId?: string | null;
  tenantId: string;
  userId: string;
}

/** Centralized TanStack query keys for copilot panel (module-scoped) and drawer (apps/ai). */
export function useEngentyAiCopilotSessionQueries(
  options: UseEngentyAiCopilotSessionQueriesOptions
) {
  const ai = useEngentyAIContext();
  return useMemo(
    () => ({
      appsAi: appsAiCopilotAppsAiQueryKeys({
        agentId: options.agentId,
        serviceBaseUrl: ai.serviceBaseUrl,
      }),
      modulePanel: appsAiCopilotModulePanelQueryKeys({
        agentId: options.agentId,
        tenantId: options.tenantId,
        userId: options.userId,
      }),
    }),
    [ai.serviceBaseUrl, options.agentId, options.tenantId, options.userId]
  );
}
