/**
 * Seed model ids, in their own module so both the purpose resolver and the role
 * catalogue can import them without forming a cycle.
 *
 * These are seeds, not live configuration: once the binding table is populated
 * they are only consulted for a role that has never been bound. Change one and
 * you change what a fresh install starts with, not what a running one uses.
 */

/** Default AI Gateway model ids (single source; re-exported by chat-model-id). */
export const DEFAULT_AI_CHAT_MODEL_ID = "openai/gpt-5.6-luna";
/** Cheapest capable agent-turn model (tools). Not the classifier 20B. */
export const DEFAULT_AI_LOW_MODEL_ID = "openai/gpt-5-nano";
/** Default for classifier / router — short jobs, open-weight, cheap. */
export const DEFAULT_AI_CLASSIFIER_MODEL_ID = "openai/gpt-oss-20b";
/**
 * Default for the planning & coding tier (sandboxed code execution, plan
 * authoring). Independently configurable so it never rides on the chat default,
 * because not all chat models accept the Mastra workspace tool message format.
 */
export const DEFAULT_AI_PLANNING_CODING_MODEL_ID = "openai/gpt-5.6-luna";
/** @deprecated Alias of {@link DEFAULT_AI_PLANNING_CODING_MODEL_ID}. */
export const DEFAULT_AI_CODE_EXECUTION_MODEL_ID =
  DEFAULT_AI_PLANNING_CODING_MODEL_ID;
/** Default safeguard model for Mastra guardrail processors. */
export const DEFAULT_AI_SAFEGUARD_MODEL_ID = "openai/gpt-oss-safeguard-20b";
