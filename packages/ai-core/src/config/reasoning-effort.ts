/**
 * Reasoning effort: how long a reasoning model thinks before it answers.
 *
 * This is a knob ON a model, not a choice between models — the graded effort
 * tiers (`model.normal`, `model.high`) pick a model; this tells the picked model
 * how hard to think. Every vendor spells it differently (OpenAI and xAI take an
 * effort word, Anthropic and Google a token budget), so the one place that
 * translates is here and callers only ever hold a level.
 *
 * A model the translation does not know gets no knob at all: a non-reasoning
 * model rejects the parameter, and a guessed spelling on an OpenAI-compatible
 * gateway is silently dropped — either way the pick would look applied and do
 * nothing. Browser-safe.
 */

import {
  ANTHROPIC_GATEWAY_ID,
  DEFAULT_MODEL_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  parseModelRef,
} from "./model-ref.js";

export const AI_REASONING_LEVELS = ["low", "medium", "high"] as const;
export type AiReasoningEffort = (typeof AI_REASONING_LEVELS)[number];

export function isReasoningEffort(value: unknown): value is AiReasoningEffort {
  return (AI_REASONING_LEVELS as readonly unknown[]).includes(value);
}

/** Anthropic `thinking.budgetTokens` / Google `thinkingBudget` per level. */
const THINKING_BUDGET_TOKENS: Record<AiReasoningEffort, number> = {
  low: 2048,
  medium: 8192,
  high: 24_576,
};

type ReasoningOptionValue =
  | number
  | string
  | { [key: string]: ReasoningOptionValue };

/**
 * Provider options for one model call, keyed by AI SDK provider. JSON-shaped
 * so it satisfies the SDK's `ProviderOptions`, which `ai` does not export.
 */
export type ReasoningProviderOptions = Record<
  string,
  { [key: string]: ReasoningOptionValue }
>;

type Vendor = "anthropic" | "google" | "openai" | "xai";

/**
 * Which vendor spelling a ref takes, or null when it takes none.
 *
 * Only the gateways whose AI SDK provider forwards the vendor's own options:
 * the Vercel gateway (keyed by vendor) and the direct OpenAI / Anthropic
 * clients. OpenRouter, Opper and the other OpenAI-compatible routes go through
 * the OpenAI chat client, which only sends `reasoning_effort` for ids it
 * recognises — a `vendor/model` id is not one of them.
 */
function vendorOf(modelRef: string): Vendor | null {
  const { gateway, modelId } = parseModelRef(modelRef);
  const vendor = modelId.slice(0, modelId.indexOf("/")).toLowerCase();
  if (gateway === OPENAI_GATEWAY_ID) {
    return vendor === "openai" ? "openai" : null;
  }
  if (gateway === ANTHROPIC_GATEWAY_ID) {
    return vendor === "anthropic" ? "anthropic" : null;
  }
  if (gateway !== DEFAULT_MODEL_GATEWAY_ID) {
    return null;
  }
  return vendor === "openai" ||
    vendor === "anthropic" ||
    vendor === "google" ||
    vendor === "xai"
    ? vendor
    : null;
}

/**
 * True when a reasoning level can be applied to this model. `reasoning` is the
 * catalog's own flag (the gateway's `reasoning` tag): a known vendor spelling
 * on a model that does not reason is still a rejected call.
 */
export function supportsReasoningEffort(
  modelRef: string,
  reasoning: boolean
): boolean {
  return reasoning && vendorOf(modelRef) !== null;
}

/**
 * The provider options that set `level` on `modelRef`, or undefined when the
 * model takes no reasoning knob. Callers gate on the catalog `reasoning` flag
 * first ({@link supportsReasoningEffort}); this only knows spellings.
 */
export function reasoningProviderOptions(
  modelRef: string,
  level: AiReasoningEffort
): ReasoningProviderOptions | undefined {
  switch (vendorOf(modelRef)) {
    case "openai":
      return { openai: { reasoningEffort: level } };
    case "xai":
      // Grok takes only the two ends of the scale.
      return { xai: { reasoningEffort: level === "high" ? "high" : "low" } };
    case "anthropic":
      return {
        anthropic: {
          thinking: {
            budgetTokens: THINKING_BUDGET_TOKENS[level],
            type: "enabled",
          },
        },
      };
    case "google":
      return {
        google: {
          thinkingConfig: { thinkingBudget: THINKING_BUDGET_TOKENS[level] },
        },
      };
    default:
      return;
  }
}
