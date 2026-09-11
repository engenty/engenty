/**
 * Auto effort: size a turn without making the user wait for a second model.
 *
 * Strategy (fast path first):
 * 1. Plan ceiling — if only one tier is licensed, return it (0 LLM).
 * 2. Lexical heuristics — certain guesses skip the router entirely.
 * 3. Cheap router model — tiny prompt, ≤16 tokens, hard timeout (~250ms).
 * 4. Fail open to medium (clamped), never block the run.
 *
 * The classifier always uses the unbound `router` binding — never the chat
 * override — so Auto stays cheap even when expert mode pinned a large model.
 */

import {
  type AiEffort,
  type AiEffortChoice,
  ceilingEffort,
  clampEffort,
  type EffortGrant,
  guessEffortFromPrompt,
  type ModelBindings,
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText } from "ai";

const logger = createLogger({ name: "apps/ai/auto-effort" });

/** Hard ceiling on classifier latency — miss → medium, never stall the turn. */
export const AUTO_EFFORT_ROUTER_TIMEOUT_MS = 250;

/** Latest-user text only; long pastes are truncated before the router sees them. */
const MAX_ROUTER_INPUT_CHARS = 500;

const SYSTEM_PROMPT = [
  "Classify how much thinking this user request needs.",
  "Reply with exactly one word: low, medium, or high.",
  "low = quick lookup, greeting, short rephrase.",
  "medium = everyday work, tools, data lookups, drafting.",
  "high = coding, CLI, multi-file edits, plans, hard reasoning.",
].join(" ");

export interface ResolveAutoEffortParams {
  /** The agent's own default tier (`agentDefaultEffort`); wins over the text. */
  agentEffort?: AiEffort | null;
  agentId?: string | null;
  /** Plan grant; null/empty = unrestricted. */
  allowedEfforts?: readonly string[] | null;
  /** Role bindings — used to resolve the cheap router model. */
  bindings?: ModelBindings;
  hasAttachments?: boolean;
  /** Optional override for tests. */
  routerModelId?: string | null;
  /** Latest user-turn text only. */
  text: string;
  /** Override the hard timeout (tests). */
  timeoutMs?: number;
}

export interface ResolveAutoEffortResult {
  effort: AiEffort;
  reason: string;
  /** How the tier was chosen — for logs / future provenance. */
  source: "ceiling" | "heuristic" | "router" | "fallback";
}

/**
 * Resolve an Auto (or missing) effort pick into a concrete tier.
 * Explicit low/medium/high are returned clamped; callers that already know
 * the pick was explicit should skip this and use clampEffort directly.
 */
export async function resolveAutoEffort(
  params: ResolveAutoEffortParams
): Promise<ResolveAutoEffortResult> {
  const grant: EffortGrant = {
    allowed_efforts: params.allowedEfforts as AiEffort[] | null | undefined,
  };
  const ceiling = ceilingEffort(grant);

  // Single licensed tier → nothing to decide.
  if (
    Array.isArray(params.allowedEfforts) &&
    params.allowedEfforts.length === 1
  ) {
    return {
      effort: ceiling,
      reason: "single_tier_plan",
      source: "ceiling",
    };
  }

  const guess = guessEffortFromPrompt({
    agentEffort: params.agentEffort,
    agentId: params.agentId,
    hasAttachments: params.hasAttachments,
    text: params.text,
  });

  if (guess.confidence === "certain") {
    return {
      effort: clampEffort(guess.effort, grant) ?? ceiling,
      reason: guess.reason,
      source: "heuristic",
    };
  }

  const routed = await classifyWithRouter({
    bindings: params.bindings,
    fallback: guess.effort,
    routerModelId: params.routerModelId,
    text: params.text,
    timeoutMs: params.timeoutMs ?? AUTO_EFFORT_ROUTER_TIMEOUT_MS,
  });

  if (routed) {
    return {
      effort: clampEffort(routed, grant) ?? ceiling,
      reason: "router",
      source: "router",
    };
  }

  return {
    effort: clampEffort(guess.effort, grant) ?? ceiling,
    reason: guess.reason,
    source: "fallback",
  };
}

export interface ResolveEffortForRunResult {
  /**
   * True when Auto (or a missing pick) sized the turn — client should toast /
   * flash. Explicit low|medium|high picks stay silent.
   */
  autoResolved: boolean;
  /** Concrete tier for model resolution; null when an expert model pin wins. */
  effort: AiEffort | null;
  reason?: string;
  source?: ResolveAutoEffortResult["source"];
}

/**
 * Wire helper: turn the user's effort choice into a concrete AiEffort for
 * model resolution. Explicit picks pass through; `auto` / missing run Auto.
 */
export async function resolveEffortForRun(input: {
  /** The agent's own default tier; applies only when the pick is Auto. */
  agentEffort?: AiEffort | null;
  agentId?: string | null;
  allowedEfforts?: readonly string[] | null;
  bindings?: ModelBindings;
  choice: AiEffortChoice | null;
  hasAttachments?: boolean;
  /** Expert model pin — when set, Auto is skipped (pin wins downstream). */
  modelIdOverride?: string | null;
  text: string;
}): Promise<ResolveEffortForRunResult> {
  if (input.modelIdOverride?.trim()) {
    // Expert pin owns the model; effort is irrelevant for resolution.
    return { autoResolved: false, effort: null };
  }
  if (
    input.choice === "low" ||
    input.choice === "medium" ||
    input.choice === "high"
  ) {
    return {
      autoResolved: false,
      effort:
        clampEffort(input.choice, {
          allowed_efforts: input.allowedEfforts as
            | AiEffort[]
            | null
            | undefined,
        }) ?? input.choice,
    };
  }
  // `auto` or missing → size the turn.
  const resolved = await resolveAutoEffort({
    agentEffort: input.agentEffort,
    agentId: input.agentId,
    allowedEfforts: input.allowedEfforts,
    bindings: input.bindings,
    hasAttachments: input.hasAttachments,
    text: input.text,
  });
  logger.debug("Auto effort resolved", {
    agent_id: input.agentId ?? null,
    effort: resolved.effort,
    reason: resolved.reason,
    source: resolved.source,
  });
  return {
    autoResolved: true,
    effort: resolved.effort,
    reason: resolved.reason,
    source: resolved.source,
  };
}

async function classifyWithRouter(params: {
  bindings?: ModelBindings;
  fallback: AiEffort;
  routerModelId?: string | null;
  text: string;
  timeoutMs: number;
}): Promise<AiEffort | null> {
  if (!readAiGatewayApiKeyFromEnv()) {
    return null;
  }
  const model =
    params.routerModelId?.trim() ||
    resolveChatModelId({
      bindings: params.bindings,
      purpose: "routing",
    });
  const prompt = params.text.trim().slice(0, MAX_ROUTER_INPUT_CHARS);
  if (!prompt) {
    return null;
  }

  try {
    const result = await Promise.race([
      generateText({
        maxOutputTokens: 8,
        model,
        prompt,
        instructions: SYSTEM_PROMPT,
        temperature: 0,
      }),
      sleepReject(params.timeoutMs),
    ]);
    if (!(result && "text" in result)) {
      return null;
    }
    return parseEffortWord(result.text);
  } catch (error) {
    logger.debug("Auto effort router skipped", {
      error: error instanceof Error ? error.message : String(error),
      model,
    });
    return null;
  }
}

function parseEffortWord(raw: string): AiEffort | null {
  const word = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .split(/\s+/)[0];
  if (word === "low" || word === "medium" || word === "high") {
    return word;
  }
  return null;
}

function sleepReject(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}
