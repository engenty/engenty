/**
 * Instant, zero-LLM read of whether a Normal turn looks like it needs high.
 *
 * Auto never moves a thread to high on its own: a `high` guess is an offer the
 * person accepts or declines before the turn runs. So the bias is towards
 * `normal` — a false offer costs the person a click, a missed one costs
 * nothing they cannot fix by picking Extra. Callers trust a `certain` guess and
 * only ask the classifier when the guess is `uncertain`.
 *
 * - High: CLI / coding / multi-edit / planning work.
 * - Normal: everything else, including tool and data work.
 */

import type { AiEffort } from "../config/model-roles.js";

export type AutoEffortConfidence = "certain" | "uncertain";

export interface AutoEffortGuess {
  confidence: AutoEffortConfidence;
  effort: AiEffort;
  /** Short machine reason for logs / provenance — not user-facing. */
  reason: string;
}

export interface GuessEffortFromPromptInput {
  /**
   * The agent's own default tier (`agentDefaultEffort`). Certain when set:
   * an App Coder's "ok, do it" is still coding.
   */
  agentEffort?: AiEffort | null;
  /** Session agent id (e.g. engenty.cli, engenty.copilot). */
  agentId?: string | null;
  /** True when the latest user turn carries file attachments. */
  hasAttachments?: boolean;
  /** Latest user-turn text only — never the full thread. */
  text: string;
}

/** Tools whose holder writes code. Coding always runs at the top tier. */
const CODING_TOOL_IDS: ReadonlySet<string> = new Set(["app_build"]);

/**
 * The tier an agent's turns run at when nobody chose one — the person left
 * the composer on Normal, or the turn is a hand-off, a delegation or a routine.
 * Declared on the agent (`effort`), else implied by a coding tool: whoever
 * holds `app_build` is building software, whatever their id or name.
 */
export function agentDefaultEffort(
  config:
    | { effort?: AiEffort | null; toolIds?: readonly string[] | null }
    | null
    | undefined
): AiEffort | null {
  if (!config) {
    return null;
  }
  if (config.effort) {
    return config.effort;
  }
  return config.toolIds?.some((id) => CODING_TOOL_IDS.has(id)) ? "high" : null;
}

/**
 * Coding / planning / multi-edit intent. Keep this tight: every match asks the
 * person whether to switch to Extra.
 */
const HIGH_RE =
  /\b(?:refactor|rewrit(?:e|ing)|implement|architect(?:ure|ing)?|multi[- ]?file|across\s+files|pull\s+request|\bprs?\b|code\s+review|migrate\s+(?:the\s+)?(?:db|database|schema)|schema\s+migration|stack\s*trace|traceback|debug\s+(?:this|the)\b|fix\s+(?:all|these)\s+(?:bugs?|errors?)|step[- ]by[- ]step\s+(?:plan|implementation|migration)|write\s+(?:a\s+|the\s+)?(?:plan|design|architecture)|plan\s+(?:how\s+to|the\s+implementation|out)\b|(?:npm|pnpm|yarn|cargo|pytest|vitest|jest)\s+\w+|git\s+(?:rebase|merge|commit|cherry-pick|stash)|(?:shell|terminal|cli)\s+(?:command|script)|run\s+(?:this\s+)?(?:in\s+)?(?:the\s+)?(?:shell|terminal|sandbox))\b/i;

/** Long, open-ended prose with no coding signal: the classifier decides. */
const LONG_LIMIT = 400;

/** Short action verbs that sometimes hide real work ("fix the login"). */
const ACTION_RE =
  /\b(?:fix|build|write|implement|analy[sz]e|compare|design|evaluate)\b/i;

export function guessEffortFromPrompt(
  input: GuessEffortFromPromptInput
): AutoEffortGuess {
  const text = input.text.trim();

  if (input.agentEffort) {
    return {
      confidence: "certain",
      effort: input.agentEffort,
      reason: `agent:${input.agentId?.trim().toLowerCase() || "default"}`,
    };
  }

  if (text.length === 0) {
    return {
      confidence: "certain",
      effort: "normal",
      reason: input.hasAttachments ? "attachments" : "empty",
    };
  }

  if (HIGH_RE.test(text)) {
    return { confidence: "certain", effort: "high", reason: "coding_signal" };
  }

  if (text.length >= LONG_LIMIT || ACTION_RE.test(text)) {
    return { confidence: "uncertain", effort: "normal", reason: "ambiguous" };
  }

  return { confidence: "certain", effort: "normal", reason: "plain" };
}
