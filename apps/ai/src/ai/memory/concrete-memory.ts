import { MastraCompositeStore, type MemoryStorage } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import type { Extractor } from "@mastra/memory/processors";

import { observationalMemoryLanguageModel } from "./observational-memory-model.js";
import {
  createSemanticRecallBindings,
  semanticRecallEnabled,
} from "./semantic-recall.js";

const ENGENTY_MEMORY_STORE_ID = "engenty-session-memory";
type EngentyMemoryOptions = NonNullable<
  NonNullable<ConstructorParameters<typeof Memory>[0]>["options"]
>;

export function observationalMemoryEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.ENGENTY_AI_OBSERVATIONAL_MEMORY !== "false";
}

/**
 * Cross-thread shared observations. Opt-in: memory entries already carry
 * what a person wants kept across chats, and this layer costs a read
 * before every model call plus up to 16k tokens of context.
 */
export function sharedObservationsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    observationalMemoryEnabled(env) &&
    env.ENGENTY_AI_SHARED_OBSERVATIONS === "true"
  );
}

// Mastra's default title instructions, plus: answer in the USER's language.
const GENERATE_TITLE_INSTRUCTIONS = `
- generate a short title based on the first message a user begins a conversation with
- ensure it is not more than 80 characters long
- the title should be a summary of the user's message
- write the title in the same language as the user's message
- do not use quotes or colons
- the entire text you return will be used as the title`;

export interface EngentySessionMastraMemoryOptions {
  /** Extra values the observer returns with its observations (working-memory.ts). */
  extractors?: readonly Extractor[];
  /** Fast-text model id (titles, observational memory); AI Gateway id. */
  modelId?: string | null;
  storage: MemoryStorage;
}

/** Fallback recall when OM is off. Mastra default; unused once an OM record exists. */
export const ENGENTY_MEMORY_LAST_MESSAGES = 10;

/**
 * Unobserved raw-message budget before thread OM may compact. Mastra's 30k
 * default is tight for 128k+ chat models once tools and instructions sit on
 * top; 80k delays prefix rewrites (better prompt cache) while leaving headroom
 * for this turn's tool transcript.
 */
export const ENGENTY_OBSERVATION_MESSAGE_TOKENS = 80_000;

/**
 * Output budgets for the observer and reflector, and the observer's input cap.
 *
 * Both steps write a complete structured document and are all-or-nothing: a run
 * that hits the provider default mid-document is discarded, so the work is paid
 * for and nothing is stored — and the observation pile it was meant to shrink
 * grows instead. Diagnosed 2026-08-28 on the resource-scoped engine
 * (`shared-observational-memory.ts`); this thread-scoped one runs on the same
 * conversation and needs the same guards.
 */
export const ENGENTY_OBSERVER_MAX_OUTPUT_TOKENS = 8000;
export const ENGENTY_REFLECTOR_MAX_OUTPUT_TOKENS = 16_000;
export const ENGENTY_PREVIOUS_OBSERVER_TOKENS = 8000;

export function createEngentySessionMemoryOptions(
  env: NodeJS.ProcessEnv = process.env,
  modelId?: string | null,
  extractors: readonly Extractor[] = []
): EngentyMemoryOptions {
  return {
    lastMessages: ENGENTY_MEMORY_LAST_MESSAGES,
    // Titles are fast-text work — not the agent's (possibly high-tier) model.
    generateTitle: {
      instructions: GENERATE_TITLE_INSTRUCTIONS,
      model: observationalMemoryLanguageModel(modelId),
    },
    // Kept across chats: memory entries and our own working memory
    // (memory-block.ts, working-memory.ts) — one per scope, which Mastra's
    // single per-resource working memory cannot hold.
    workingMemory: { enabled: false },
    observationalMemory: observationalMemoryEnabled(env)
      ? {
          activateAfterIdle: "auto",
          activateOnProviderChange: true,
          enabled: true,
          model: observationalMemoryLanguageModel(modelId),
          observation: {
            // Was `bufferOnIdle: true`, which is "observe at the end of EVERY
            // turn" — independent of `messageTokens`. Measured 2026-08-29: two
            // observer calls per turn, 10.5k input tokens against the copilot
            // step's 36.6k, i.e. ~22% of the turn spent re-reading the same
            // conversation. Observation now follows the token schedule
            // (`bufferTokens` defaults to 20% of `messageTokens`), and
            // `activateAfterIdle: "auto"` still force-activates what was
            // buffered, so nothing is lost — it lands a little later.
            bufferOnIdle: false,
            messageTokens: ENGENTY_OBSERVATION_MESSAGE_TOKENS,
            // The observer is handed "Previous Observations" in full unless
            // capped, so its prompt grows with the pile it is meant to condense.
            previousObserverTokens: ENGENTY_PREVIOUS_OBSERVER_TOKENS,
            modelSettings: {
              maxOutputTokens: ENGENTY_OBSERVER_MAX_OUTPUT_TOKENS,
            },
            observeAttachments: false,
            ...(extractors.length > 0 ? { extract: [...extractors] } : {}),
          },
          reflection: {
            modelSettings: {
              maxOutputTokens: ENGENTY_REFLECTOR_MAX_OUTPUT_TOKENS,
            },
          },
          scope: "thread",
        }
      : false,
    ...(semanticRecallEnabled(env)
      ? {
          semanticRecall: {
            messageRange: { after: 1, before: 1 },
            scope: "thread" as const,
            topK: 4,
          },
        }
      : {}),
  };
}

// Fallback recall window when OM is disabled/unavailable. Once a thread has an
// OM record, Mastra loads all unobserved messages after its observation cursor.
export function createEngentySessionMastraMemory(
  options: EngentySessionMastraMemoryOptions
): Memory {
  const semantic = createSemanticRecallBindings();
  return new Memory({
    options: createEngentySessionMemoryOptions(
      process.env,
      options.modelId,
      options.extractors
    ),
    storage: new MastraCompositeStore({
      domains: { memory: options.storage },
      id: ENGENTY_MEMORY_STORE_ID,
    }),
    ...(semantic
      ? { embedder: semantic.embedder, vector: semantic.vector }
      : {}),
  });
}
