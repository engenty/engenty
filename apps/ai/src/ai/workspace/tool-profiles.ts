import type { AgentToolProfile } from "@engenty/ai-core";

/**
 * Tool profiles: deny-by-default allowlists applied at assembly time.
 *
 * A profile enforces a hard ceiling on the tools an agent may use, regardless
 * of what is stored in the agent's config row. Only tool ids in the allowlist
 * may attach. Agents with a profile also receive no workspace skill-search or
 * catalog meta-tools (engenty_tools_search, engenty_tool_execute).
 *
 * Add entries here as new profiles are declared in ai-core's AgentToolProfile.
 */
export const TOOL_PROFILE_ALLOWLISTS: Record<AgentToolProfile, Set<string>> = {
  /**
   * read_only_kb — scoped internal chat surface (e.g. knowledge-base.answers).
   * Mirrors the external chatbot's KB-scoped tool set, applied internally.
   */
  read_only_kb: new Set(["knowledge_base_article_search", "kb_faqs_list"]),
};

/** Catalog/registry meta-tools that must not attach to profiled agents. */
export const CATALOG_META_TOOL_IDS = new Set([
  "engenty_tools_search",
  "engenty_tool_execute",
]);
