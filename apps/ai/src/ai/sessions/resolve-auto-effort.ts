/**
 * The tier a turn runs at: Normal or high (the composer's Extra).
 *
 * A thread changes tier only when the person says so. Switching models
 * mid-thread starts a cold prompt cache — the whole thread is billed and read
 * again — so Auto never does it silently:
 *
 * 1. An explicit pick (Extra = `high`, a declined offer = `normal`) wins.
 * 2. A thread already on high stays there until its next chapter.
 * 3. A Normal turn that looks like it needs high becomes an offer: the run is
 *    not started, the person is asked, and the turn is sent again with their
 *    answer (heuristics; the classifier only when they are unsure).
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
  type ClassifierSource,
  classifierWantsHigh,
} from "./approve-effort-change.js";

const logger = createLogger({ name: "apps/ai/auto-effort" });

export type EffortSource =
  | "agent"
  | "ceiling"
  | "classifier"
  | "heuristic"
  | "picked"
  | "sticky";

export interface EffortOffer {
  proposed: "high";
  reason: string;
}

export interface ResolveEffortForRunResult {
  /** Concrete tier for model resolution; null when a model pin wins. */
  effort: AiEffort | null;
  /** Set when the turn must not run yet: ask the person to switch to high. */
  offer?: EffortOffer;
  reason?: string;
  source?: EffortSource;
}

export async function resolveEffortForRun(input: {
  /** The agent's own default tier; applies only when the pick is Normal. */
  agentEffort?: AiEffort | null;
  agentId?: string | null;
  allowedEfforts?: readonly string[] | null;
  choice: AiEffortChoice | null;
  /** Loaded only when the heuristics cannot tell. */
  classifier?: ClassifierSource;
  hasAttachments?: boolean;
  /** A Custom pin owns the model; effort is irrelevant for resolution. */
  modelIdOverride?: string | null;
  /** The thread ran at high and no chapter has been cut since. */
  threadOnHigh?: boolean;
  /** Latest user-turn text; empty on a resume, which never asks. */
  text: string;
}): Promise<ResolveEffortForRunResult> {
  if (input.modelIdOverride?.trim()) {
    return { effort: null };
  }
  const grant: EffortGrant = {
    allowed_efforts: input.allowedEfforts as AiEffort[] | null | undefined,
  };
  if (input.choice === "normal" || input.choice === "high") {
    return {
      effort: clampEffort(input.choice, grant) ?? input.choice,
      source: "picked",
    };
  }
  if (ceilingEffort(grant) === "normal") {
    return { effort: "normal", source: "ceiling" };
  }
  if (input.agentEffort) {
    return {
      effort: clampEffort(input.agentEffort, grant) ?? input.agentEffort,
      source: "agent",
    };
  }
  if (input.threadOnHigh) {
    return { effort: "high", source: "sticky" };
  }

  const guess = guessEffortFromPrompt({
    agentId: input.agentId,
    hasAttachments: input.hasAttachments,
    text: input.text,
  });
  if (guess.effort === "high") {
    return offer(guess.reason, "heuristic", input.agentId);
  }
  if (guess.confidence === "uncertain") {
    const wantsHigh = await classifierWantsHigh({
      agentId: input.agentId ?? null,
      classifier: input.classifier,
      hasAttachments: input.hasAttachments ?? false,
      text: input.text,
    });
    if (wantsHigh) {
      return offer(guess.reason, "classifier", input.agentId);
    }
  }
  return { effort: "normal", reason: guess.reason, source: "heuristic" };
}

function offer(
  reason: string,
  source: EffortSource,
  agentId: string | null | undefined
): ResolveEffortForRunResult {
  logger.debug("Auto effort offers high", {
    agent_id: agentId ?? null,
    reason,
    source,
  });
  return {
    effort: "normal",
    offer: { proposed: "high", reason },
    reason,
    source,
  };
}
