// Maps a persisted `AgentConfig.guardrails` JSON config into concrete
// Mastra processor instances (`@mastra/core/processors`). Deterministic so the
// unit tests can assert which processors land in which array.
//
// Moderation and prompt-injection detection are classification, so they ask
// the `classifier` binding (Jev, or an LLM through structured output) — see
// `classifier-guardrail-processor.ts`. PII detection and the system-prompt
// scrubber rewrite text, which a classifier cannot, so they stay on Mastra's
// processors with the `fast_text` model. Input checks use the last message
// only so per-turn cost stays flat regardless of transcript length. Output
// stream order: `BatchPartsProcessor` first to consolidate chunks before the
// heavier processors judge them.

import type { AgentGuardrailsConfig } from "@engenty/ai-core";
import { createClassifierClient } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { ClassifierClient } from "@engenty/typesafe-client";
import type { MastraModelConfig } from "@mastra/core/llm";
import {
  BatchPartsProcessor,
  PIIDetector,
  type Processor,
  type ProcessorViolation,
  SystemPromptScrubber,
} from "@mastra/core/processors";
import { resolveMastraModel } from "../../model-gateways/resolve-language-model.js";
import {
  ClassifierGuardrailProcessor,
  type ClassifierGuardrailStrategy,
} from "./classifier-guardrail-processor.js";

const logger = createLogger({ name: "apps/ai/guardrails" });

/** Mastra ModerationProcessor's defaults, kept so a config without categories asks the same. */
export const DEFAULT_MODERATION_CATEGORIES = [
  "hate",
  "hate/threatening",
  "harassment",
  "harassment/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
] as const;
const DEFAULT_MODERATION_THRESHOLD = 0.5;

/** Mastra PromptInjectionDetector's defaults. */
export const DEFAULT_PROMPT_INJECTION_TYPES = [
  "injection",
  "jailbreak",
  "tool-exfiltration",
  "data-exfiltration",
  "system-override",
  "role-manipulation",
] as const;
const DEFAULT_PROMPT_INJECTION_THRESHOLD = 0.7;

export interface BuildGuardrailProcessorsOptions {
  agentId: string;
  /** Test seam: the classifier to ask instead of building one from the ref. */
  classifier?: ClassifierClient | null;
  /** The run's `classifier` ref — moderation and prompt-injection checks. */
  classifierModelId: string;
  /** The run's `fast_text` ref — PII redaction and the prompt scrubber. */
  textModelId: string;
}

export interface BuildGuardrailProcessorsResult {
  inputProcessors: Processor[];
  outputProcessors: Processor[];
}

/** The run's classifier, or null (checks skipped) when its model is unreachable. */
function guardrailClassifier(
  options: BuildGuardrailProcessorsOptions
): ClassifierClient | null {
  const classifier =
    options.classifier === undefined
      ? (createClassifierClient(options.classifierModelId)?.client ?? null)
      : options.classifier;
  if (!classifier) {
    // Mastra's guardrails let content through when their model failed; an
    // unreachable classifier is the same failure, known up front.
    logger.warn("Guardrail classifier unavailable; checks skipped", {
      agent_id: options.agentId,
      model: options.classifierModelId,
    });
  }
  return classifier;
}

function withViolationLogger<T extends Processor>(
  processor: T,
  agentId: string
): T {
  processor.onViolation = (violation: ProcessorViolation) => {
    logger.warn("Guardrail violation", {
      agent_id: agentId,
      processor_id: violation.processorId,
      message: violation.message,
    });
  };
  return processor;
}

/** Moderation: Mastra's constructor kept block/warn/filter and defaulted the rest to block. */
function moderationStrategy(
  strategy: string | undefined
): ClassifierGuardrailStrategy {
  return strategy === "warn" || strategy === "filter" ? strategy : "block";
}

/**
 * Prompt injection: `detect` only reported, so it maps to `warn`. `rewrite`
 * needs generated text a classifier cannot give, so it blocks — the safe side.
 */
function injectionStrategy(
  strategy: string | undefined
): ClassifierGuardrailStrategy {
  if (strategy === "warn" || strategy === "detect") {
    return "warn";
  }
  return strategy === "filter" ? "filter" : "block";
}

export function buildGuardrailProcessors(
  guardrails: AgentGuardrailsConfig | undefined,
  options: BuildGuardrailProcessorsOptions
): BuildGuardrailProcessorsResult {
  const empty: BuildGuardrailProcessorsResult = {
    inputProcessors: [],
    outputProcessors: [],
  };
  if (!guardrails?.enabled) {
    return empty;
  }

  const inputProcessors: Processor[] = [];
  const outputProcessors: Processor[] = [];

  const input = guardrails.input ?? {};
  const output = guardrails.output ?? {};

  let textModel: MastraModelConfig | null = null;
  const text = () => {
    textModel ??= resolveMastraModel<MastraModelConfig>(options.textModelId);
    return textModel;
  };
  const wantsClassifier = [
    input.promptInjection,
    input.moderation,
    output.moderation,
  ].some((cfg) => cfg && cfg.enabled !== false);
  const classifier = wantsClassifier ? guardrailClassifier(options) : null;

  if (
    input.promptInjection?.enabled !== false &&
    input.promptInjection &&
    classifier
  ) {
    const cfg = input.promptInjection;
    inputProcessors.push(
      withViolationLogger(
        new ClassifierGuardrailProcessor({
          categories: cfg.detectionTypes ?? DEFAULT_PROMPT_INJECTION_TYPES,
          classifier,
          id: "prompt-injection-detector",
          judging:
            "whether a user message attacks the assistant (prompt injection, jailbreak, exfiltration, overriding its instructions)",
          label: "prompt injection",
          lastMessageOnly: true,
          strategy: injectionStrategy(cfg.strategy),
          threshold: cfg.threshold ?? DEFAULT_PROMPT_INJECTION_THRESHOLD,
        }),
        options.agentId
      )
    );
  }

  if (input.moderation?.enabled !== false && input.moderation && classifier) {
    inputProcessors.push(
      moderationProcessor(input.moderation, {
        agentId: options.agentId,
        classifier,
        lastMessageOnly: true,
      })
    );
  }

  if (input.pii?.enabled !== false && input.pii) {
    const cfg = input.pii;
    inputProcessors.push(
      withViolationLogger(
        new PIIDetector({
          model: text(),
          lastMessageOnly: true,
          ...(cfg.strategy === "block" ||
          cfg.strategy === "warn" ||
          cfg.strategy === "filter" ||
          cfg.strategy === "redact"
            ? { strategy: cfg.strategy }
            : {}),
          ...(typeof cfg.threshold === "number"
            ? { threshold: cfg.threshold }
            : {}),
          ...(cfg.detectionTypes ? { detectionTypes: cfg.detectionTypes } : {}),
          ...(cfg.redactionMethod
            ? { redactionMethod: cfg.redactionMethod }
            : {}),
        }),
        options.agentId
      )
    );
  }

  // Stream output: batch first so heavier classifiers run on consolidated chunks.
  if (output.batchParts?.enabled !== false && output.batchParts) {
    const cfg = output.batchParts;
    outputProcessors.push(
      new BatchPartsProcessor({
        ...(typeof cfg.batchSize === "number"
          ? { batchSize: cfg.batchSize }
          : {}),
        ...(typeof cfg.maxWaitTime === "number"
          ? { maxWaitTime: cfg.maxWaitTime }
          : {}),
      })
    );
  }

  if (output.moderation?.enabled !== false && output.moderation && classifier) {
    outputProcessors.push(
      moderationProcessor(output.moderation, {
        agentId: options.agentId,
        classifier,
        lastMessageOnly: false,
      })
    );
  }

  if (output.pii?.enabled !== false && output.pii) {
    const cfg = output.pii;
    outputProcessors.push(
      withViolationLogger(
        new PIIDetector({
          model: text(),
          ...(cfg.strategy === "block" ||
          cfg.strategy === "warn" ||
          cfg.strategy === "filter" ||
          cfg.strategy === "redact"
            ? { strategy: cfg.strategy }
            : {}),
          ...(typeof cfg.threshold === "number"
            ? { threshold: cfg.threshold }
            : {}),
          ...(cfg.detectionTypes ? { detectionTypes: cfg.detectionTypes } : {}),
          ...(cfg.redactionMethod
            ? { redactionMethod: cfg.redactionMethod }
            : {}),
        }),
        options.agentId
      )
    );
  }

  if (
    output.systemPromptScrubber?.enabled !== false &&
    output.systemPromptScrubber
  ) {
    const cfg = output.systemPromptScrubber;
    outputProcessors.push(
      withViolationLogger(
        new SystemPromptScrubber({
          model: text(),
          ...(cfg.strategy === "block" ||
          cfg.strategy === "warn" ||
          cfg.strategy === "filter" ||
          cfg.strategy === "redact"
            ? { strategy: cfg.strategy }
            : {}),
          ...(cfg.customPatterns ? { customPatterns: cfg.customPatterns } : {}),
          ...(cfg.redactionMethod
            ? { redactionMethod: cfg.redactionMethod }
            : {}),
        }),
        options.agentId
      )
    );
  }

  return { inputProcessors, outputProcessors };
}

function moderationProcessor(
  cfg: NonNullable<NonNullable<AgentGuardrailsConfig["input"]>["moderation"]>,
  params: {
    agentId: string;
    classifier: ClassifierClient;
    lastMessageOnly: boolean;
  }
): Processor {
  return withViolationLogger(
    new ClassifierGuardrailProcessor({
      categories: cfg.categories ?? DEFAULT_MODERATION_CATEGORIES,
      classifier: params.classifier,
      id: "moderation",
      judging: "whether content violates a content-safety policy",
      label: "moderation",
      lastMessageOnly: params.lastMessageOnly,
      strategy: moderationStrategy(cfg.strategy),
      threshold: cfg.threshold ?? DEFAULT_MODERATION_THRESHOLD,
    }),
    params.agentId
  );
}
