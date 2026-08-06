import type { AgentGuardrailsConfig } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";

// Mock Mastra processors with simple classes that record their constructor
// options. This lets us assert ordering and per-processor config without
// running real LLM classifiers.
vi.mock("@mastra/core/processors", () => {
  class FakeProcessor {
    readonly id: string;
    options: unknown;
    onViolation?: (v: unknown) => void;
    constructor(id: string, options?: unknown) {
      this.id = id;
      this.options = options;
    }
  }
  return {
    PromptInjectionDetector: class extends FakeProcessor {
      constructor(options: unknown) {
        super("prompt-injection-detector", options);
      }
    },
    ModerationProcessor: class extends FakeProcessor {
      constructor(options: unknown) {
        super("moderation", options);
      }
    },
    PIIDetector: class extends FakeProcessor {
      constructor(options: unknown) {
        super("pii-detector", options);
      }
    },
    SystemPromptScrubber: class extends FakeProcessor {
      constructor(options: unknown) {
        super("system-prompt-scrubber", options);
      }
    },
    BatchPartsProcessor: class extends FakeProcessor {
      constructor(options: unknown) {
        super("batch-parts", options);
      }
    },
  };
});

vi.mock("ai", () => ({
  // Wrap the model id so we can distinguish "did we go through gateway?"
  gateway: (modelId: string) => ({ __gateway: true, modelId }),
}));

import { buildGuardrailProcessors } from "../build-guardrail-processors.js";

const SAFEGUARD_MODEL = "openai/gpt-oss-safeguard-20b";

function options() {
  return { agentId: "chatbot.test", safeguardModelId: SAFEGUARD_MODEL };
}

function ids(processors: Array<{ id: string }>): string[] {
  return processors.map((p) => p.id);
}

describe("buildGuardrailProcessors", () => {
  it("returns empty arrays when guardrails are missing", () => {
    const { inputProcessors, outputProcessors } = buildGuardrailProcessors(
      undefined,
      options()
    );
    expect(inputProcessors).toEqual([]);
    expect(outputProcessors).toEqual([]);
  });

  it("returns empty arrays when guardrails.enabled is false", () => {
    const cfg: AgentGuardrailsConfig = {
      enabled: false,
      input: {
        promptInjection: { enabled: true, strategy: "block" },
      },
    };
    const { inputProcessors, outputProcessors } = buildGuardrailProcessors(
      cfg,
      options()
    );
    expect(inputProcessors).toEqual([]);
    expect(outputProcessors).toEqual([]);
  });

  it("builds the full default chatbot stack with BatchParts first in output", () => {
    const cfg: AgentGuardrailsConfig = {
      enabled: true,
      input: {
        promptInjection: {
          enabled: true,
          strategy: "block",
          threshold: 0.8,
          detectionTypes: ["injection", "jailbreak", "system-override"],
        },
        moderation: {
          enabled: true,
          strategy: "block",
          threshold: 0.7,
          categories: ["hate", "harassment", "violence"],
        },
        pii: {
          enabled: true,
          strategy: "redact",
          redactionMethod: "mask",
          detectionTypes: ["email", "phone", "credit-card"],
        },
      },
      output: {
        batchParts: { enabled: true, batchSize: 10 },
        moderation: { enabled: true, strategy: "block", threshold: 0.7 },
        pii: { enabled: true, strategy: "redact", redactionMethod: "mask" },
        systemPromptScrubber: { enabled: true, strategy: "redact" },
      },
    };

    const { inputProcessors, outputProcessors } = buildGuardrailProcessors(
      cfg,
      options()
    );

    expect(ids(inputProcessors)).toEqual([
      "prompt-injection-detector",
      "moderation",
      "pii-detector",
    ]);
    expect(ids(outputProcessors)).toEqual([
      "batch-parts",
      "moderation",
      "pii-detector",
      "system-prompt-scrubber",
    ]);
  });

  it("skips processors with enabled: false but keeps the rest", () => {
    const cfg: AgentGuardrailsConfig = {
      enabled: true,
      input: {
        promptInjection: { enabled: true, strategy: "block" },
        moderation: { enabled: false, strategy: "block" },
        pii: { enabled: true, strategy: "redact" },
      },
      output: {
        batchParts: { enabled: true },
        moderation: { enabled: true, strategy: "block" },
        pii: { enabled: false, strategy: "redact" },
        systemPromptScrubber: { enabled: true, strategy: "redact" },
      },
    };

    const { inputProcessors, outputProcessors } = buildGuardrailProcessors(
      cfg,
      options()
    );

    expect(ids(inputProcessors)).toEqual([
      "prompt-injection-detector",
      "pii-detector",
    ]);
    expect(ids(outputProcessors)).toEqual([
      "batch-parts",
      "moderation",
      "system-prompt-scrubber",
    ]);
  });

  it("passes safeguard model through gateway and forwards processor config", () => {
    const cfg: AgentGuardrailsConfig = {
      enabled: true,
      input: {
        pii: {
          enabled: true,
          strategy: "redact",
          redactionMethod: "mask",
          threshold: 0.5,
          detectionTypes: ["email"],
        },
      },
    };

    const { inputProcessors } = buildGuardrailProcessors(cfg, options());
    expect(inputProcessors).toHaveLength(1);
    // `Processor` does not declare `options`; the guardrail processors carry it
    // as construction state, so reach for it through `unknown`.
    const opts = (
      inputProcessors[0] as unknown as { options: Record<string, unknown> }
    ).options;
    expect(opts.model).toEqual({
      __gateway: true,
      modelId: SAFEGUARD_MODEL,
    });
    expect(opts.lastMessageOnly).toBe(true);
    expect(opts.strategy).toBe("redact");
    expect(opts.redactionMethod).toBe("mask");
    expect(opts.threshold).toBe(0.5);
    expect(opts.detectionTypes).toEqual(["email"]);
  });

  it("attaches an onViolation hook to LLM-classifier processors", () => {
    const cfg: AgentGuardrailsConfig = {
      enabled: true,
      input: {
        promptInjection: { enabled: true, strategy: "block" },
      },
      output: {
        batchParts: { enabled: true },
      },
    };

    const { inputProcessors, outputProcessors } = buildGuardrailProcessors(
      cfg,
      options()
    );

    expect(
      (inputProcessors[0] as { onViolation?: unknown }).onViolation
    ).toBeTypeOf("function");
    // BatchParts doesn't classify content so it intentionally has no hook.
    expect(
      (outputProcessors[0] as { onViolation?: unknown }).onViolation
    ).toBeUndefined();
  });
});
