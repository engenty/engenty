// Core admin HTTP client for UI triggers.

import type { AiRuntimeTrigger } from "./ai-runtime-types.js";
import { request } from "./request.js";

export function getAiTriggers(signal?: AbortSignal) {
  return request<{ triggers: AiRuntimeTrigger[] }>("/api/ai/triggers", {
    signal,
  });
}
