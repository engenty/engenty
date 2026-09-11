import { describe, expect, it } from "vitest";
import type { Article, Faq } from "../../src/schema/types.js";
import { articleMatches, faqMatches } from "./entity-optimistic-mutations.js";

describe("knowledge-base filtered optimistic reducers", () => {
  it("projects article category and lifecycle moves", () => {
    const article = {
      category_id: "category-2",
      kb_id: "kb-1",
      status: "published",
      title: "Immediate",
    } as Article;
    expect(
      articleMatches(article, {
        category_id: "category-2",
        kb_id: "kb-1",
        status: "published",
      })
    ).toBe(true);
    expect(
      articleMatches(article, {
        category_id: "category-1",
        kb_id: "kb-1",
      })
    ).toBe(false);
  });

  it("projects FAQ status and search membership", () => {
    const faq = {
      kb_id: "kb-1",
      question: "How does this work?",
      status: "published",
    } as Faq;
    expect(
      faqMatches(faq, {
        kb_id: "kb-1",
        search: "does",
        status: "published",
      })
    ).toBe(true);
    expect(faqMatches(faq, { kb_id: "kb-1", status: "draft" })).toBe(false);
  });
});
