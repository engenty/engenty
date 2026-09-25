import type {
  ClassifierClient,
  SystemOneRequest,
} from "@engenty/typesafe-client";
import type {
  ProcessInputArgs,
  ProcessOutputStreamArgs,
} from "@mastra/core/processors";
import { describe, expect, it, vi } from "vitest";
import {
  ClassifierGuardrailProcessor,
  type ClassifierGuardrailStrategy,
} from "../classifier-guardrail-processor.js";

class Aborted extends Error {}

function classifierScoring(
  scores: Record<string, number>
): ClassifierClient & { requests: SystemOneRequest[] } {
  const requests: SystemOneRequest[] = [];
  return {
    requests,
    systemOne: async (request) => {
      requests.push(request);
      return {
        answers: Object.fromEntries(
          Object.keys(request.questions).map((key, index) => [
            key,
            { noul: Object.values(scores)[index] ?? 0, type: "noul" as const },
          ])
        ),
        model: "test",
      };
    },
  };
}

function message(id: string, text: string) {
  return {
    content: { format: 2, parts: [{ text, type: "text" }] },
    createdAt: new Date(),
    id,
    role: "user",
  } as unknown as ProcessInputArgs["messages"][number];
}

function inputArgs(messages: ProcessInputArgs["messages"]) {
  const abort = vi.fn((reason?: string) => {
    throw new Aborted(reason);
  });
  return {
    abort,
    args: { abort, messages } as unknown as ProcessInputArgs,
  };
}

function processor(
  classifier: ClassifierClient,
  strategy: ClassifierGuardrailStrategy,
  lastMessageOnly = true
) {
  return new ClassifierGuardrailProcessor({
    categories: ["hate", "violence"],
    classifier,
    id: "moderation",
    judging: "content safety",
    label: "moderation",
    lastMessageOnly,
    strategy,
    threshold: 0.5,
  });
}

describe("ClassifierGuardrailProcessor", () => {
  it("asks one noul question per category in a single call", async () => {
    const classifier = classifierScoring({ hate: 0.1, violence: 0.2 });
    const { args } = inputArgs([message("m1", "hello there")]);
    const result = await processor(classifier, "block").processInput(args);
    expect(classifier.requests).toHaveLength(1);
    expect(Object.values(classifier.requests[0]?.questions ?? {})).toEqual([
      expect.objectContaining({ type: "noul" }),
      expect.objectContaining({ type: "noul" }),
    ]);
    expect(classifier.requests[0]?.state).toEqual({ content: "hello there" });
    expect(result).toHaveLength(1);
  });

  it("blocks when a category reaches the threshold and reports the violation", async () => {
    const guard = processor(
      classifierScoring({ hate: 0.1, violence: 0.9 }),
      "block"
    );
    const onViolation = vi.fn();
    guard.onViolation = onViolation;
    const { abort, args } = inputArgs([message("m1", "bad")]);
    await expect(guard.processInput(args)).rejects.toBeInstanceOf(Aborted);
    expect(abort).toHaveBeenCalledWith(
      "Content flagged for moderation. Categories: violence"
    );
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ processorId: "moderation" })
    );
  });

  it("filters only the flagged message and checks only the last one", async () => {
    const classifier = classifierScoring({ hate: 0.8, violence: 0 });
    const { args } = inputArgs([message("m1", "old"), message("m2", "new")]);
    const result = await processor(classifier, "filter").processInput(args);
    expect(result.map((m) => m.id)).toEqual(["m1"]);
    expect(classifier.requests).toHaveLength(1);
  });

  it("warns and lets content through", async () => {
    const { abort, args } = inputArgs([message("m1", "bad")]);
    const result = await processor(
      classifierScoring({ hate: 0.9, violence: 0 }),
      "warn"
    ).processInput(args);
    expect(abort).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("fails open when the classifier errors", async () => {
    const failing: ClassifierClient = {
      systemOne: () => Promise.reject(new Error("typesafe_http_503")),
    };
    const { abort, args } = inputArgs([message("m1", "anything")]);
    const result = await processor(failing, "block").processInput(args);
    expect(abort).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("drops a flagged stream chunk under filter and passes other parts", async () => {
    const guard = processor(
      classifierScoring({ hate: 0.9, violence: 0 }),
      "filter"
    );
    const abort = vi.fn();
    const textPart = {
      payload: { id: "t", text: "bad words" },
      type: "text-delta",
    } as unknown as ProcessOutputStreamArgs["part"];
    const otherPart = {
      payload: {},
      type: "step-start",
    } as unknown as ProcessOutputStreamArgs["part"];
    expect(
      await guard.processOutputStream({
        abort,
        part: textPart,
      } as unknown as ProcessOutputStreamArgs)
    ).toBeNull();
    expect(
      await guard.processOutputStream({
        abort,
        part: otherPart,
      } as unknown as ProcessOutputStreamArgs)
    ).toBe(otherPart);
  });
});
