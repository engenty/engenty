"use client";

import { useQuery } from "@engenty/query-client";
import {
  type ActionContext,
  type ActionRequestRecord,
  getAppsAiActionRequests,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type {
  ActionContext,
  ActionRequestRecord,
} from "../ag-ui/apps-ai/apps-ai-api.js";

/**
 * Recent `ai.action_request` audit rows for one action, newest first.
 * Pass `context` to scope to one subject (per-place run history, D1).
 */
export function useActionRequestsQuery(
  actionId: string | null,
  context?: ActionContext
) {
  return useQuery<ActionRequestRecord[], Error>({
    queryKey: ["apps-ai", "action-requests", actionId, context ?? null],
    enabled: Boolean(actionId),
    queryFn: ({ signal }) => {
      const baseUrl = resolveEngentyAiServiceBaseUrl();
      if (!baseUrl) {
        throw new Error("VITE_ENGENTY_AI_BASE_URL is not configured");
      }
      return getAppsAiActionRequests(baseUrl, actionId ?? "", context, signal);
    },
  });
}
