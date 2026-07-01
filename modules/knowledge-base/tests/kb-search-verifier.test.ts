import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn((input) => input),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: aiMocks.generateText,
    Output: {
      ...actual.Output,
      object: aiMocks.outputObject,
    },
  };
});

import {
  countKbSearchQueryTerms,
  shouldVerifyKbSearchQuery,
  verifyKbSearchResults,
} from "../src/services/kb-search-verifier.js";

describe("kb-search-verifier", () => {
  let gatewayApiKey: string | undefined;

  beforeEach(() => {
    gatewayApiKey = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "sk-test";
    aiMocks.generateText.mockReset();
    aiMocks.outputObject.mockClear();
  });

  afterEach(() => {
    if (gatewayApiKey === undefined) {
      Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    } else {
      process.env.AI_GATEWAY_API_KEY = gatewayApiKey;
    }
  });

  it("counts query terms for long-query gating", () => {
    expect(countKbSearchQueryTerms("software zur 3d bearbeitung")).toBe(4);
    expect(
      shouldVerifyKbSearchQuery("software zur 3d bearbeitung", {
        search_verifier_min_query_terms: 4,
        search_verifier_max_candidates: 6,
      })
    ).toBe(true);
    expect(
      shouldVerifyKbSearchQuery("3d software", {
        search_verifier_min_query_terms: 4,
        search_verifier_max_candidates: 6,
      })
    ).toBe(false);
  });

  it("filters candidates by mocked LLM relevance decisions", async () => {
    aiMocks.generateText.mockResolvedValue({
      output: {
        matches: [
          { article_id: "keep", relevant: true },
          { article_id: "drop", relevant: false },
        ],
      },
    });

    const out = await verifyKbSearchResults({
      query: "software zur 3d bearbeitung",
      settings: {
        search_verifier_min_query_terms: 4,
        search_verifier_max_candidates: 6,
      },
      candidates: [
        {
          article: null,
          result: {
            article_id: "keep",
            title: "3D Software",
            chunk_text: "Software zur 3D Bearbeitung.",
            score: 0.64,
          },
        },
        {
          article: null,
          result: {
            article_id: "drop",
            title: "Agent docs",
            chunk_text: "Internal agent routing documentation.",
            score: 0.52,
          },
        },
      ],
    });

    expect(aiMocks.generateText).toHaveBeenCalledOnce();
    expect(out.map((row) => row.article_id)).toEqual(["keep"]);
  });

  it("submits only the configured candidate cap", async () => {
    aiMocks.generateText.mockResolvedValue({
      output: {
        matches: [{ article_id: "first", relevant: true }],
      },
    });

    const out = await verifyKbSearchResults({
      query: "software zur 3d bearbeitung",
      settings: {
        search_verifier_min_query_terms: 4,
        search_verifier_max_candidates: 1,
      },
      candidates: [
        {
          article: null,
          result: {
            article_id: "first",
            title: "First",
            chunk_text: "match",
            score: 0.8,
          },
        },
        {
          article: null,
          result: {
            article_id: "second",
            title: "Second",
            chunk_text: "not submitted",
            score: 0.7,
          },
        },
      ],
    });

    expect(out.map((row) => row.article_id)).toEqual(["first"]);
    const prompt = aiMocks.generateText.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain("first");
    expect(prompt).not.toContain("second");
  });
});
