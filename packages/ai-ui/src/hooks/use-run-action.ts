"use client";

import { useMutation } from "@engenty/query-client";
import {
  postAppsAiActionRun,
  type RunActionInput,
  type RunActionResult,
  resolveEngentyAiServiceBaseUrl,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export type {
  RunActionInput,
  RunActionResult,
} from "../ag-ui/apps-ai/apps-ai-api.js";

export function useRunAction() {
  return useMutation<RunActionResult, Error, RunActionInput>({
    mutationFn: async (params) => {
      const baseUrl = resolveEngentyAiServiceBaseUrl();
      if (!baseUrl) {
        throw new Error("VITE_ENGENTY_AI_BASE_URL is not configured");
      }
      return postAppsAiActionRun(baseUrl, params);
    },
  });
}
