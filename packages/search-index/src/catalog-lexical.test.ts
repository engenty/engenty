import { describe, expect, it } from "vitest";
import {
  buildCatalogSearchText,
  CATALOG_FIELD_WEIGHTS,
  rankLexically,
  scoreCatalogEntry,
  tokenizeCatalogText,
} from "./catalog-lexical.js";

describe("catalog lexical scoring", () => {
  const contactsList = {
    id: "contacts_list",
    toolId: "contacts_list",
    moduleId: "contacts",
    title: "List contacts",
    description: "Find contacts by search term",
  };
  const teamRoute = {
    id: "GET /api/team",
    moduleId: "team",
    title: "List team members",
    path: "/api/team",
  };

  it("tokenizes camelCase and diacritics", () => {
    expect(tokenizeCatalogText("contactsListÜber")).toEqual([
      "contacts",
      "list",
      "uber",
    ]);
  });

  it("scores entries with matching tokens and zero without", () => {
    expect(scoreCatalogEntry(contactsList, "contacts")).toBeGreaterThan(0);
    expect(scoreCatalogEntry(contactsList, "unrelated")).toBe(0);
    expect(scoreCatalogEntry(contactsList, "")).toBe(0);
  });

  it("weights id/toolId matches above description matches", () => {
    const idScore = scoreCatalogEntry(contactsList, "contacts");
    const descriptionOnly = scoreCatalogEntry(
      { description: "Find contacts by search term" },
      "contacts"
    );
    expect(idScore).toBeGreaterThan(descriptionOnly);
  });

  it("supports custom field weights", () => {
    const summaryWeighted = scoreCatalogEntry(
      { summary: "List contacts" },
      "contacts",
      [["summary", 6]]
    );
    expect(summaryWeighted).toBeGreaterThan(0);
    // Default weights have no `summary` field, so the same entry scores 0.
    expect(scoreCatalogEntry({ summary: "List contacts" }, "contacts")).toBe(0);
  });

  it("rankLexically sorts by score and drops zero-score entries", () => {
    const entries = [teamRoute, contactsList];
    const scores = entries.map((entry) => scoreCatalogEntry(entry, "contacts"));
    const ranked = rankLexically(entries, scores);
    expect(ranked).toEqual([contactsList]);
  });

  it("buildCatalogSearchText emits weighted key/value lines", () => {
    const text = buildCatalogSearchText(contactsList, CATALOG_FIELD_WEIGHTS);
    expect(text).toContain("toolId: contacts_list");
    expect(text).toContain("moduleId: contacts");
    expect(text).not.toContain("summary:");
  });
});
