import { describe, expect, it } from "vitest";
import type { KbSearchResult } from "../schema/types.js";
import {
  buildVerifierQuestions,
  countKbSearchQueryTerms,
  relevantFromAnswers,
  shouldVerifyKbSearchQuery,
  verifyKbSearchResults,
} from "./kb-search-verifier.js";

function result(id: string): KbSearchResult {
  return {
    article_id: id,
    chunk_text: `chunk ${id}`,
    score: 0.5,
    title: `Article ${id}`,
  } as unknown as KbSearchResult;
}

const settings = {
  search_verifier_max_candidates: 6,
  search_verifier_min_query_terms: 2,
};

describe("shouldVerifyKbSearchQuery", () => {
  it("gates on the configured minimum term count", () => {
    expect(countKbSearchQueryTerms("software zur 3d bearbeitung")).toBe(4);
    expect(
      shouldVerifyKbSearchQuery("software zur 3d bearbeitung", {
        search_verifier_max_candidates: 6,
        search_verifier_min_query_terms: 4,
      })
    ).toBe(true);
    expect(
      shouldVerifyKbSearchQuery("3d software", {
        search_verifier_max_candidates: 6,
        search_verifier_min_query_terms: 4,
      })
    ).toBe(false);
  });
});

describe("buildVerifierQuestions", () => {
  it("asks one noul per candidate over the query and the candidates", () => {
    const { questions, state } = buildVerifierQuestions("vat on invoices", [
      { article_id: "a", chunk_text: "x", index: 9 } as never,
      { article_id: "b", chunk_text: "y" } as never,
    ]);
    expect(Object.keys(questions)).toEqual(["c0", "c1"]);
    expect(questions.c0?.type).toBe("noul");
    expect(state.query).toBe("vat on invoices");
    expect(state.candidates.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe("relevantFromAnswers", () => {
  it("keeps at or above the floor, keeps malformed, drops below", () => {
    expect(
      relevantFromAnswers(
        {
          c0: { noul: 0.91, type: "noul" },
          c1: { noul: 0.2, type: "noul" },
          c2: { choice: "x", type: "choice" },
          c3: { noul: 0.5, type: "noul" },
        },
        5
      )
    ).toEqual([true, false, true, true, true]);
  });
});

describe("verifyKbSearchResults with Jev", () => {
  it("returns the candidates Jev kept, in the submitted order", async () => {
    const jev = {
      systemOne: async () => ({
        answers: {
          c0: { noul: 0.1, type: "noul" },
          c1: { noul: 0.8, type: "noul" },
        },
        model: "jev-test",
      }),
    } as unknown as import("@engenty/typesafe-client").ClassifierClient;
    const kept = await verifyKbSearchResults({
      candidates: [
        { article: null, result: result("a") },
        { article: null, result: result("b") },
      ],
      classifier: jev,
      query: "vat on invoices",
      settings,
    });
    expect(kept.map((r) => r.article_id)).toEqual(["b"]);
  });

  it("submits only the configured candidate cap", async () => {
    const asked: string[] = [];
    const jev = {
      systemOne: async (request: {
        state: { candidates: { article_id: string }[] };
      }) => {
        asked.push(...request.state.candidates.map((c) => c.article_id));
        return {
          answers: { c0: { noul: 0.9, type: "noul" } },
          model: "jev-test",
        };
      },
    } as unknown as import("@engenty/typesafe-client").ClassifierClient;
    const kept = await verifyKbSearchResults({
      candidates: [
        { article: null, result: result("first") },
        { article: null, result: result("second") },
      ],
      classifier: jev,
      query: "vat on invoices",
      settings: { ...settings, search_verifier_max_candidates: 1 },
    });
    expect(asked).toEqual(["first"]);
    expect(kept.map((r) => r.article_id)).toEqual(["first"]);
  });

  it("returns every candidate unverified when Jev fails", async () => {
    const jev = {
      systemOne: async () => {
        throw new Error("typesafe_http_503");
      },
    } as unknown as import("@engenty/typesafe-client").ClassifierClient;
    const kept = await verifyKbSearchResults({
      candidates: [{ article: null, result: result("a") }],
      classifier: jev,
      query: "vat on invoices",
      settings,
    });
    expect(kept.map((r) => r.article_id)).toEqual(["a"]);
  });
});
