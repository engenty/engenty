// Maps a persisted `AgentConfig.guardrails` JSON config into concrete
// Mastra processor instances (`@mastra/core/processors`). Pure / deterministic
// so the unit tests can assert which processors land in which array.
//
// All LLM-classifier processors share the same safeguard model and use
// `lastMessageOnly: true` so per-turn cost stays flat regardless of transcript
// length. Output stream order: `BatchPartsProcessor` first to consolidate
// chunks before the heavier processors classify them.

import type { AgentGuardrailsConfig } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { MastraModelConfig } from "@mastra/core/llm";
import {
  BatchPartsProcessor,
  ModerationProcessor,
  PIIDetector,
  type Processor,
  type ProcessorViolation,
  PromptInjectionDetector,
  SystemPromptScrubber,
} from "@mastra/core/processors";
import { resolveMastraModel } from "../../model-gateways/resolve-language-model.js";

const logger = createLogger({ name: "apps/ai/guardrails" });

export interface BuildGuardrailProcessorsOptions {
  agentId: string;
  safeguardModelId: string;
}

export interface BuildGuardrailProcessorsResult {
  inputProcessors: Processor[];
  outputProcessors: Processor[];
}

function resolveSafeguardModel(modelId: string): MastraModelConfig {
  return resolveMastraModel<MastraModelConfig>(modelId);
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

  const model = resolveSafeguardModel(options.safeguardModelId);
  const inputProcessors: Processor[] = [];
  const outputProcessors: Processor[] = [];

  const input = guardrails.input ?? {};
  const output = guardrails.output ?? {};

  if (input.promptInjection?.enabled !== false && input.promptInjection) {
    const cfg = input.promptInjection;
    inputProcessors.push(
      withViolationLogger(
        new PromptInjectionDetector({
          model,
          lastMessageOnly: true,
          ...(cfg.strategy && cfg.strategy !== "redact"
            ? {
                strategy: cfg.strategy as
                  | "block"
                  | "warn"
                  | "filter"
                  | "rewrite",
              }
            : {}),
          ...(typeof cfg.threshold === "number"
            ? { threshold: cfg.threshold }
            : {}),
          ...(cfg.detectionTypes ? { detectionTypes: cfg.detectionTypes } : {}),
        }),
        options.agentId
      )
    );
  }

  if (input.moderation?.enabled !== false && input.moderation) {
    const cfg = input.moderation;
    inputProcessors.push(
      withViolationLogger(
        new ModerationProcessor({
          model,
          lastMessageOnly: true,
          ...(cfg.strategy === "block" ||
          cfg.strategy === "warn" ||
          cfg.strategy === "filter"
            ? { strategy: cfg.strategy }
            : {}),
          ...(typeof cfg.threshold === "number"
            ? { threshold: cfg.threshold }
            : {}),
          ...(cfg.categories ? { categories: cfg.categories } : {}),
        }),
        options.agentId
      )
    );
  }

  if (input.pii?.enabled !== false && input.pii) {
    const cfg = input.pii;
    inputProcessors.push(
      withViolationLogger(
        new PIIDetector({
          model,
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

  if (output.moderation?.enabled !== false && output.moderation) {
    const cfg = output.moderation;
    outputProcessors.push(
      withViolationLogger(
        new ModerationProcessor({
          model,
          ...(cfg.strategy === "block" ||
          cfg.strategy === "warn" ||
          cfg.strategy === "filter"
            ? { strategy: cfg.strategy }
            : {}),
          ...(typeof cfg.threshold === "number"
            ? { threshold: cfg.threshold }
            : {}),
          ...(cfg.categories ? { categories: cfg.categories } : {}),
        }),
        options.agentId
      )
    );
  }

  if (output.pii?.enabled !== false && output.pii) {
    const cfg = output.pii;
    outputProcessors.push(
      withViolationLogger(
        new PIIDetector({
          model,
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
          model,
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
