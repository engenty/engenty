import {
  aiChatsSearchInputSchema,
  CHAT_THREAD_INDEX_HEALTH_METHOD,
  CHAT_THREAD_SEARCH_METHOD,
} from "@engenty/ai-core";

export const CORE_CHAT_THREAD_SEARCH_REMOVED_MESSAGE =
  "Core orchestrator chat thread search was removed (schema-split Phase 3). Use apps/ai /ai/v1/search/chats/* via VITE_ENGENTY_AI_BASE_URL.";

export function buildChatThreadSearchMethod() {
  return {
    name: CHAT_THREAD_SEARCH_METHOD,
    description: "Retired — chat thread search lives in apps/ai.",
    handler: async () => {
      throw new Error(CORE_CHAT_THREAD_SEARCH_REMOVED_MESSAGE);
    },
    inputSchema: aiChatsSearchInputSchema,
  };
}

export function buildChatThreadIndexHealthMethod() {
  return {
    name: CHAT_THREAD_INDEX_HEALTH_METHOD,
    description: "Retired — chat thread index health lives in apps/ai.",
    handler: async () => {
      throw new Error(CORE_CHAT_THREAD_SEARCH_REMOVED_MESSAGE);
    },
    inputSchema: aiChatsSearchInputSchema,
  };
}
