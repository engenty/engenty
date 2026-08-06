/**
 * Instant, zero-LLM effort sizing for Auto mode.
 *
 * The router call is the expensive path — this module exists so most turns never
 * pay it. Callers should trust a `certain` guess and only invoke the cheap
 * router model when the guess is `uncertain`.
 *
 * Bias (product rules):
 * - High: CLI / coding / multi-edit / planning work.
 * - Medium floor: anything that clearly needs tools or data ops.
 * - Low: short, mechanical, no-tool turns.
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
  /** Session agent id (e.g. engenty.cli, engenty.copilot). */
  agentId?: string | null;
  /** True when the latest user turn carries file attachments. */
  hasAttachments?: boolean;
  /** Latest user-turn text only — never the full thread. */
  text: string;
}

/** Agents that are coding / CLI specialists — always high when Auto. */
const HIGH_AGENT_IDS = new Set(["engenty.cli", "engenty.app-coder"]);

/**
 * Coding / planning / multi-edit intent. Keep this tight: a false high costs
 * latency and money; a miss falls through to the router or medium.
 */
const HIGH_RE =
  /\b(?:refactor|rewrit(?:e|ing)|implement|architect(?:ure|ing)?|multi[- ]?file|across\s+files|pull\s+request|\bprs?\b|code\s+review|migrate\s+(?:the\s+)?(?:db|database|schema)|schema\s+migration|stack\s*trace|traceback|debug\s+(?:this|the)\b|fix\s+(?:all|these)\s+(?:bugs?|errors?)|step[- ]by[- ]step\s+(?:plan|implementation|migration)|write\s+(?:a\s+|the\s+)?(?:plan|design|architecture)|plan\s+(?:how\s+to|the\s+implementation|out)\b|(?:npm|pnpm|yarn|cargo|pytest|vitest|jest)\s+\w+|git\s+(?:rebase|merge|commit|cherry-pick|stash)|(?:shell|terminal|cli)\s+(?:command|script)|run\s+(?:this\s+)?(?:in\s+)?(?:the\s+)?(?:shell|terminal|sandbox))\b/i;

/**
 * Tool / data-op intent → floor at medium (never low). Copilot's everyday
 * "create a contact / search tasks" path must not get the flash tier.
 */
const MEDIUM_TOOL_RE =
  /\b(?:create|update|delete|add|remove|find|search|look\s*up|fetch|list|send|schedule|assign|move|archive|export|import|sync)\b.{0,40}\b(?:contact|contacts|task|tasks|project|projects|email|emails|invoice|invoices|offer|offers|document|documents|file|files|thread|threads|message|messages|deal|deals|company|companies|kb|knowledge|note|notes|event|events|meeting|meetings|calendar|ticket|tickets)\b/i;

const MEDIUM_TOOL_RE_ALT =
  /\b(?:send\s+(?:an?\s+)?email|draft\s+(?:an?\s+)?(?:email|reply|offer)|book\s+(?:a\s+)?meeting|set\s+up\s+(?:a\s+)?(?:task|project|reminder)|use\s+(?:the\s+)?(?:tool|tools|api)|call\s+(?:the\s+)?(?:api|tool))\b/i;

const LOW_GREETING_RE =
  /^(?:hi|hello|hey|hallo|servus|moin|thanks|thank\s+you|danke|ok|okay|got\s+it|cool|nice|👍|🙏)[\s!.?]*$/i;

const LOW_SIMPLE_RE =
  /^(?:what(?:'s| is| are)|who(?:'s| is| are)|when(?:'s| is| are)|where(?:'s| is| are)|how\s+do\s+i\s+say|translate|rephrase|reword|format\s+(?:this|as)|make\s+this\s+shorter|summarise\s+this|summarize\s+this)\b/i;

const SHORT_LIMIT = 48;

export function guessEffortFromPrompt(
  input: GuessEffortFromPromptInput
): AutoEffortGuess {
  const text = input.text.trim();
  const agentId = input.agentId?.trim().toLowerCase() || "";

  if (agentId && HIGH_AGENT_IDS.has(agentId)) {
    return {
      confidence: "certain",
      effort: "high",
      reason: `agent:${agentId}`,
    };
  }

  if (text.length === 0) {
    // Empty turn (e.g. attachment-only or resume) — attachments need tools;
    // otherwise stay at the balanced default without paying for a router call.
    if (input.hasAttachments) {
      return {
        confidence: "certain",
        effort: "medium",
        reason: "attachments",
      };
    }
    return {
      confidence: "certain",
      effort: "medium",
      reason: "empty",
    };
  }

  if (HIGH_RE.test(text)) {
    return { confidence: "certain", effort: "high", reason: "coding_signal" };
  }

  if (MEDIUM_TOOL_RE.test(text) || MEDIUM_TOOL_RE_ALT.test(text)) {
    return {
      confidence: "certain",
      effort: "medium",
      reason: "tool_signal",
    };
  }

  if (input.hasAttachments) {
    return {
      confidence: "certain",
      effort: "medium",
      reason: "attachments",
    };
  }

  if (LOW_GREETING_RE.test(text)) {
    return { confidence: "certain", effort: "low", reason: "greeting" };
  }

  if (text.length <= SHORT_LIMIT && LOW_SIMPLE_RE.test(text)) {
    return { confidence: "certain", effort: "low", reason: "simple_qa" };
  }

  if (text.length <= SHORT_LIMIT && !/\n/.test(text)) {
    // Short single-line prompts with no coding/tool signal are usually cheap,
    // but not always — leave the door open for the router on borderline cases
    // that still look like work ("fix the login").
    if (
      /\b(?:fix|build|write|change|edit|update|create|delete|implement)\b/i.test(
        text
      )
    ) {
      return {
        confidence: "uncertain",
        effort: "medium",
        reason: "short_action",
      };
    }
    return { confidence: "certain", effort: "low", reason: "short" };
  }

  return {
    confidence: "uncertain",
    effort: "medium",
    reason: "ambiguous",
  };
}
