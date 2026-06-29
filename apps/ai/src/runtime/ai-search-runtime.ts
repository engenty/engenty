// Module-level holder for the apps/ai `SearchIndexRegistry`. `createApp`
// calls `setAiSearchIndexRegistry(...)` at boot so in-process consumers
// (Mastra `chatSessionSearch` tool, future module tools) can resolve a
// provider without going through HTTP. Tests reset this between runs.

import type { SearchIndexRegistry } from "@engenty/search-index";

let activeRegistry: SearchIndexRegistry | null = null;

// Set by `apps/ai/src/app.ts` once the registry is constructed at boot. Pass
// `null` from tests / shutdown paths to clear the holder.
export function setAiSearchIndexRegistry(
  registry: SearchIndexRegistry | null
): void {
  activeRegistry = registry;
}

// Read by Mastra tools (chat-session-search and friends) that want to call
// a provider directly in-process. Returns `null` until `createApp` runs.
export function getAiSearchIndexRegistry(): SearchIndexRegistry | null {
  return activeRegistry;
}
