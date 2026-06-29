// Core admin HTTP client for agent chat prefs and live tool schema introspection.
// Still on apps/core `/api/admin/ai/*` until Phase 4 client cutover to apps/ai.

import type {
  AiAgentChatTriggers,
  AiAgentToolSchemaSnapshot,
} from "./ai-runtime-types.js";
import { request } from "./request.js";

export function patchAiAgentChatPrefs(
  agentId: string,
  input: {
    include_in_chat_picker?: boolean;
    is_active?: boolean;
    mention_routing_enabled?: boolean;
  },
  signal?: AbortSignal
) {
  return request<{ chat_triggers: AiAgentChatTriggers }>(
    `/api/admin/ai/agents/${encodeURIComponent(agentId)}/chat-prefs`,
    { body: JSON.stringify(input), method: "PATCH", signal }
  );
}

export function fetchAdminAgentToolSchemas(
  agentId: string,
  toolIds: string[],
  signal?: AbortSignal
) {
  const query = new URLSearchParams();
  if (toolIds.length > 0) {
    query.set("tools", toolIds.join(","));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ tools: AiAgentToolSchemaSnapshot[] }>(
    `/api/admin/ai/agents/${encodeURIComponent(agentId)}/tool-schemas${suffix}`,
    { method: "GET", signal }
  );
}
