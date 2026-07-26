import { describe, expect, it } from "vitest";
import {
  allowListToStored,
  formatAllowList,
  parseAllowList,
  unknownModelIds,
} from "./allow-list-input";

describe("parseAllowList", () => {
  it("splits on commas and whitespace", () => {
    expect(parseAllowList("openai/gpt-5, anthropic/claude-sonnet-5")).toEqual([
      "openai/gpt-5",
      "anthropic/claude-sonnet-5",
    ]);
    expect(parseAllowList("openai/gpt-5\nopenai/gpt-5-mini")).toEqual([
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ]);
  });

  it("canonicalises to trimmed lowercase so enforcement can match", () => {
    expect(parseAllowList("  OpenAI/GPT-5  ")).toEqual(["openai/gpt-5"]);
  });

  it("drops blanks and duplicates", () => {
    expect(parseAllowList(" , , openai/gpt-5, OPENAI/GPT-5 ")).toEqual([
      "openai/gpt-5",
    ]);
    expect(parseAllowList("   ")).toEqual([]);
  });
});

describe("allowListToStored", () => {
  it("stores an empty input as null, not an empty array", () => {
    // null and [] both read as unrestricted, but null is the shape the rest of
    // the stack writes — keep one representation.
    expect(allowListToStored("  ")).toBeNull();
    expect(allowListToStored("openai/gpt-5")).toEqual(["openai/gpt-5"]);
  });
});

describe("formatAllowList", () => {
  it("round-trips through parse", () => {
    const stored = allowListToStored("openai/gpt-5, anthropic/claude-sonnet-5");
    expect(parseAllowList(formatAllowList(stored))).toEqual(stored);
  });

  it("renders null as empty", () => {
    expect(formatAllowList(null)).toBe("");
  });
});

describe("unknownModelIds", () => {
  const catalog = ["openai/gpt-5", "anthropic/claude-sonnet-5"];

  it("flags ids the catalog does not contain", () => {
    expect(unknownModelIds(["openai/gpt-5", "openai/typo"], catalog)).toEqual([
      "openai/typo",
    ]);
  });

  it("flags a routing-prefixed id whose bare form is in the catalog", () => {
    // The exact case that put a never-matching entry into a live allow-list.
    expect(
      unknownModelIds(
        ["openrouter/openai/gpt-oss-safeguard-20b"],
        ["openai/gpt-oss-safeguard-20b"]
      )
    ).toEqual(["openrouter/openai/gpt-oss-safeguard-20b"]);
  });

  it("stays silent when the catalog has not loaded", () => {
    expect(unknownModelIds(["anything"], [])).toEqual([]);
  });
});
