"use client";

import { useMutation } from "@engenty/query-client";
import {
  postAppsAiActionRun,
  type RunActionInput,
  type RunWorkflowResult,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type {
  RunActionInput,
  RunWorkflowResult,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export function useRunWorkflow() {
  return useMutation<RunWorkflowResult, Error, RunActionInput>({
    mutationFn: async (params) => {
      const baseUrl = resolveEngentyAiServiceBaseUrl();
      if (!baseUrl) {
        throw new Error("VITE_ENGENTY_AI_BASE_URL is not configured");
      }
      return postAppsAiActionRun(baseUrl, params);
    },
  });
}
