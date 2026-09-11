"use client";

import { useQuery } from "@engenty/query-client";
import {
  type ActionContext,
  getAppsAiWorkflowRuns,
  resolveEngentyAiServiceBaseUrl,
  type WorkflowRunRecord,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type {
  ActionContext,
  WorkflowRunRecord,
} from "../ag-ui/apps-ai/apps-ai-api.js";

/**
 * Recent `ai.workflow_run` audit rows for one action, newest first.
 * Pass `context` to scope to one subject (per-place run history, D1).
 */
export function useWorkflowRunsQuery(
  workflowId: string | null,
  context?: ActionContext
) {
  return useQuery<WorkflowRunRecord[], Error>({
    queryKey: ["apps-ai", "action-requests", workflowId, context ?? null],
    enabled: Boolean(workflowId),
    queryFn: ({ signal }) => {
      const baseUrl = resolveEngentyAiServiceBaseUrl();
      if (!baseUrl) {
        throw new Error("VITE_ENGENTY_AI_BASE_URL is not configured");
      }
      return getAppsAiWorkflowRuns(baseUrl, workflowId ?? "", context, signal);
    },
  });
}
