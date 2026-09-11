import { describe, expect, it } from "vitest";
import {
  mergeSpaceCatalogSearch,
  rankSpaceCatalogLexically,
} from "./space-catalog-search";

const PROJECTS = {
  category: "engenty",
  description: "Project management with phases, tasks, and client portal",
  id: "projects",
  name: "Projects",
};
const INVOICES = {
  category: "commercial",
  description: "Invoice CRUD with SQLite and PDF export",
  id: "invoices",
  name: "Invoices",
};
const APPS = {
  category: "engenty",
  description:
    "Tenant-owned applications with a frontend, a backend and their own storage",
  id: "engenty-apps",
  name: "Apps",
};

describe("space catalog lexical search", () => {
  it("returns every row when the query is empty", () => {
    expect(rankSpaceCatalogLexically([PROJECTS, INVOICES], "")).toEqual([
      PROJECTS,
      INVOICES,
    ]);
  });

  it("matches prefix tokens, not only exact substrings", () => {
    expect(rankSpaceCatalogLexically([PROJECTS, INVOICES], "proj")).toEqual([
      PROJECTS,
    ]);
  });

  it("does not treat unrelated commercial apps as coding matches", () => {
    expect(
      rankSpaceCatalogLexically([PROJECTS, INVOICES, APPS], "coding")
    ).toEqual([]);
  });

  it("treats coding as a match for skills that talk about code", () => {
    const sandbox = {
      category: "engenty",
      description: "Run Python or shell scripts in a sandbox",
      id: "sandbox-code-execution",
      name: "sandbox-code-execution",
    };
    expect(
      rankSpaceCatalogLexically([sandbox, INVOICES], "coding").map(
        (item) => item.id
      )
    ).toEqual(["sandbox-code-execution"]);
  });
});

describe("mergeSpaceCatalogSearch", () => {
  it("prefers semantic order and keeps lexical-only hits", () => {
    expect(
      mergeSpaceCatalogSearch(
        [PROJECTS, INVOICES, APPS],
        [PROJECTS],
        ["engenty-apps", "projects"]
      ).map((item) => item.id)
    ).toEqual(["engenty-apps", "projects"]);
  });
});
