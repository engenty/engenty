// Auto-mode resolver. Picks a sensible default `SearchStrategy` from a
// provider's declared capabilities when the caller omits one. Mirrors
// Mastra's "defaults to the best available mode based on configuration".

import type {
  SearchIndexProvider,
  SearchProviderCapabilities,
  SearchStrategy,
} from "./contracts.js";

export function resolveSearchStrategy(
  source:
    | SearchIndexProvider
    | { capabilities?: SearchProviderCapabilities }
    | SearchProviderCapabilities,
  request?: { strategy?: SearchStrategy }
): SearchStrategy {
  if (request?.strategy) {
    return request.strategy;
  }
  const caps = extractCapabilities(source);
  if (caps.hybrid && caps.lexical && caps.semantic) {
    return "hybrid";
  }
  if (caps.semantic) {
    return "semantic";
  }
  return "lexical";
}

function extractCapabilities(
  source:
    | SearchIndexProvider
    | { capabilities?: SearchProviderCapabilities }
    | SearchProviderCapabilities
): SearchProviderCapabilities {
  if (
    "capabilities" in source &&
    source.capabilities &&
    typeof source.capabilities === "object"
  ) {
    return source.capabilities;
  }
  if ("lexical" in source || "semantic" in source || "hybrid" in source) {
    return source as SearchProviderCapabilities;
  }
  return { lexical: true };
}
