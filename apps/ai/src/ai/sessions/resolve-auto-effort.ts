/**
 * Auto effort: size a turn without making the user wait.
 *
 * 1. Plan ceiling — if only one tier is licensed, return it.
 * 2. Lexical heuristics size the turn.
 * 3. When that leaves the thread's tier while its prompt cache is still warm,
 *    the classifier must approve the switch (approve-effort-change.ts).
 *    Every other turn goes without a second model.
 */

import {
  type AiEffort,
  type AiEffortChoice,
  ceilingEffort,
  clampEffort,
  type EffortGrant,
  guessEffortFromPrompt,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import {
  approveEffortChange,
  type ClassifierSource,
  isCacheWarm,
  type PreviousEffort,
} from "./approve-effort-change.js";

const logger = createLogger({ name: "apps/ai/auto-effort" });

export interface ResolveAutoEffortParams {
  /** The agent's own default tier (`agentDefaultEffort`); wins over the text. */
  agentEffort?: AiEffort | null;
  agentId?: string | null;
  /** Plan grant; null/empty = unrestricted. */
  allowedEfforts?: readonly string[] | null;
  /**
   * The run's classifier, or a loader for it — called only when a tier change
   * would cost a warm cache. Omitted or null = the heuristics decide alone.
   */
  classifier?: ClassifierSource;
  hasAttachments?: boolean;
  /** The thread's last turn; null on a new thread. */
  previous?: PreviousEffort | null;
  /** Latest user-turn text only. */
  text: string;
}

export interface ResolveAutoEffortResult {
  effort: AiEffort;
  reason: string;
  /** How the tier was chosen — for logs / future provenance. */
  source: "ceiling" | "heuristic" | "classifier";
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

  const proposed = clampEffort(guess.effort, grant) ?? ceiling;
  const current = params.previous
    ? clampEffort(params.previous.effort, grant)
    : null;
  if (
    !(params.previous && current) ||
    current === proposed ||
    !isCacheWarm(params.previous)
  ) {
    return { effort: proposed, reason: guess.reason, source: "heuristic" };
  }

  const approved = await approveEffortChange({
    agentId: params.agentId ?? null,
    classifier: params.classifier,
    current,
    hasAttachments: params.hasAttachments ?? false,
    proposed,
    text: params.text,
  });
  if (approved === null) {
    return { effort: proposed, reason: guess.reason, source: "heuristic" };
  }
  return approved
    ? { effort: proposed, reason: guess.reason, source: "classifier" }
    : { effort: current, reason: "cache_warm", source: "classifier" };
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
  choice: AiEffortChoice | null;
  /** The run's `classifier` binding, loaded only if a tier change needs approval. */
  classifier?: ClassifierSource;
  hasAttachments?: boolean;
  /** Expert model pin — when set, Auto is skipped (pin wins downstream). */
  modelIdOverride?: string | null;
  /** The thread's last turn; null on a new thread. */
  previous?: PreviousEffort | null;
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
    classifier: input.classifier,
    hasAttachments: input.hasAttachments,
    previous: input.previous,
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
