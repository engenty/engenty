// The helper's two sources and its cache: the span picker answers what it
// can, the low-tier model answers the rest, and a page's values are asked
// for once. The model is mocked at the `ai` boundary.
import { bindingsFromList, setPlatformBindings } from "@engenty/ai-core";
import type { ClassifierClient } from "@engenty/typesafe-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));
vi.mock("../../../../model-gateways/resolve-language-model.js", () => ({
  resolveLanguageModel: (id: string) => id,
}));

import {
  createFieldText,
  type FieldContext,
  reasoningOptions,
  resolveTextHelperModelId,
} from "../text-helper.js";

const GOAL =
  "Fly from Wien to Seoul on 12 Oct 2026; use promo code from my profile";

function context(
  field: string,
  fields = ["Where from?", "Where to?", "Promo code"]
): FieldContext {
  const described = fields.map((label) => ({
    label,
    role: "textbox",
    value: "",
  }));
  return {
    field: described.find((f) => f.label === field) as FieldContext["field"],
    fields: described,
    goal: GOAL,
    page: { text: "Flights", title: "Google Flights" },
    recent_actions: [],
  };
}

/** A classifier that names a span per field label, or NONE. */
function spanClient(picks: Record<string, string | null>) {
  const systemOne = vi.fn(
    async (request: {
      questions: Record<string, { criteria: Record<string, string> }>;
      state: { fields: { label: string }[] };
    }) => {
      const answers: Record<string, unknown> = {};
      request.state.fields.forEach((field, i) => {
        const head = `field_${i + 1}`;
        const criteria = request.questions[head]?.criteria ?? {};
        const ids = Object.keys(criteria);
        const wanted = picks[field.label] ?? null;
        const id =
          wanted === null
            ? "NONE"
            : (Object.entries(criteria).find(([, v]) => v === wanted)?.[0] ??
              "NONE");
        answers[head] = {
          choice: id,
          confidence: 0.9,
          probabilities: Object.fromEntries(
            ids.map((k) => [k, k === id ? 0.9 : 0.1 / (ids.length - 1)])
          ),
          type: "choice",
        };
      });
      return {
        answers,
        model: "jev",
        usage: { input_tokens: 10, output_tokens: 0 },
      };
    }
  );
  return { client: { systemOne } as unknown as ClassifierClient, systemOne };
}

describe("reasoningOptions", () => {
  it("sets the effort knob only for families that understand it", () => {
    expect(reasoningOptions("openai/gpt-5-nano")).toEqual({
      openai: { reasoningEffort: "minimal" },
    });
    expect(reasoningOptions("openai/gpt-5.4-nano")).toEqual({
      openai: { reasoningEffort: "minimal" },
    });
    expect(reasoningOptions("openrouter:openai/gpt-5-mini")).toEqual({
      openai: { reasoningEffort: "minimal" },
    });
    expect(reasoningOptions("openai/gpt-oss-20b")).toEqual({
      openai: { reasoningEffort: "low" },
    });
    expect(reasoningOptions("openai/gpt-4.1-nano")).toBeUndefined();
    expect(reasoningOptions("google/gemini-3.5-flash-lite")).toBeUndefined();
  });
});

describe("resolveTextHelperModelId", () => {
  afterEach(() => {
    setPlatformBindings(undefined);
  });

  it("is the model.low binding, not the classifier", () => {
    setPlatformBindings(
      bindingsFromList([
        {
          gateway: "vercel",
          modelId: "openai/gpt-5.4-nano",
          role: "model.low",
        },
        { gateway: "vercel", modelId: "test/classifier", role: "classifier" },
      ])
    );
    expect(resolveTextHelperModelId()).toBe("openai/gpt-5.4-nano");
  });
});

describe("createFieldText", () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  it("takes span values from the classifier and asks the model only for the rest, once per page", async () => {
    const { client, systemOne } = spanClient({
      "Promo code": null,
      "Where from?": "Wien",
      "Where to?": "Seoul",
    });
    generateText.mockResolvedValue({
      text: JSON.stringify({
        values: {
          "Promo code": null,
          "Where from?": "Wien",
          "Where to?": "Seoul",
        },
      }),
    });
    const fieldText = createFieldText({
      modelId: "openai/gpt-5-nano",
      spans: { client, model: "typesafe-ai/jev" },
    });

    const from = await fieldText(context("Where from?"));
    expect(from).toMatchObject({ source: "span", text: "Wien" });
    expect(systemOne).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();

    const to = await fieldText(context("Where to?"));
    expect(to).toMatchObject({ latency_ms: 0, source: "span", text: "Seoul" });
    expect(systemOne).toHaveBeenCalledTimes(1);

    const promo = await fieldText(context("Promo code"));
    expect(promo).toMatchObject({ source: "llm", text: null });
    expect(generateText).toHaveBeenCalledTimes(1);
    const call = generateText.mock.calls[0]?.[0] as {
      model: string;
      providerOptions?: unknown;
      temperature: number;
    };
    expect(call.model).toBe("openai/gpt-5-nano");
    expect(call.providerOptions).toEqual({
      openai: { reasoningEffort: "minimal" },
    });
    expect(call.temperature).toBe(0);

    // A revisit of the same page is free on every source.
    await fieldText(context("Promo code"));
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(systemOne).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the model without a span client and caches all fields", async () => {
    generateText.mockResolvedValue({
      text: '```json\n{"values": {"Where from?": "Wien", "Where to?": "Seoul", "Promo code": null}}\n```',
    });
    const fieldText = createFieldText({ modelId: "openai/gpt-4.1-nano" });
    expect(await fieldText(context("Where to?"))).toMatchObject({
      source: "llm",
      text: "Seoul",
    });
    expect(await fieldText(context("Where from?"))).toMatchObject({
      latency_ms: 0,
      text: "Wien",
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(
      (generateText.mock.calls[0]?.[0] as { providerOptions?: unknown })
        .providerOptions
    ).toBeUndefined();
  });

  it("falls back to the model when the span picker fails", async () => {
    const client = {
      systemOne: vi.fn(async () => {
        throw new Error("typesafe_http_529");
      }),
    } as unknown as ClassifierClient;
    generateText.mockResolvedValue({
      text: JSON.stringify({ values: { "Where to?": "Seoul" } }),
    });
    const fieldText = createFieldText({ modelId: "m", spans: { client } });
    expect(await fieldText(context("Where to?", ["Where to?"]))).toMatchObject({
      source: "llm",
      text: "Seoul",
    });
  });

  it("types nothing on a malformed model answer", async () => {
    generateText.mockResolvedValue({ text: "Seoul" });
    const fieldText = createFieldText({ modelId: "m" });
    await expect(
      fieldText(context("Where to?", ["Where to?"]))
    ).rejects.toThrow(/text_helper_invalid/);
  });

  it("asks again when the page's fields change", async () => {
    generateText
      .mockResolvedValueOnce({
        text: JSON.stringify({ values: { "Where to?": "Seoul" } }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ values: { "Where to?": null } }),
      });
    const fieldText = createFieldText({ modelId: "m" });
    await fieldText(context("Where to?", ["Where to?"]));
    const filled = context("Where to?", ["Where to?"]);
    filled.field.value = "Seoul";
    filled.fields[0]!.value = "Seoul";
    expect((await fieldText(filled)).text).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
