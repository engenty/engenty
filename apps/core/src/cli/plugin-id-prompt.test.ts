import { describe, expect, it } from "vitest";
import {
  isPluginActive,
  resolvePluginIdsFromArgsOrPrompt,
} from "./plugin-id-prompt.js";

describe("resolvePluginIdsFromArgsOrPrompt", () => {
  it("returns trimmed id as single-element array", async () => {
    const r = await resolvePluginIdsFromArgsOrPrompt({
      id: "  hello-world  ",
      json: false,
      opts: {},
      verb: "activate",
    });
    expect(r).toEqual(["hello-world"]);
  });

  it("parses comma-separated ids", async () => {
    const r = await resolvePluginIdsFromArgsOrPrompt({
      id: "b, a, b ",
      json: false,
      opts: {},
      verb: "activate",
    });
    expect(r).toEqual(["a", "b"]);
  });

  it("throws when --json without id", async () => {
    await expect(
      resolvePluginIdsFromArgsOrPrompt({
        id: undefined,
        json: true,
        opts: {},
        verb: "activate",
      })
    ).rejects.toThrow(/required with --json/);
  });

  it("throws in non-interactive mode without id", async () => {
    await expect(
      resolvePluginIdsFromArgsOrPrompt({
        id: undefined,
        json: false,
        opts: {},
        promptMode: "non-interactive",
        verb: "deactivate",
      })
    ).rejects.toThrow(/non-interactive/);
  });
});

describe("isPluginActive", () => {
  it("is false when disabled", () => {
    expect(
      isPluginActive({
        id: "x",
        enabled: false,
        loaded: true,
      })
    ).toBe(false);
  });

  it("is false when not loaded", () => {
    expect(
      isPluginActive({
        id: "x",
        enabled: true,
        loaded: false,
      })
    ).toBe(false);
  });

  it("is true when enabled and loaded", () => {
    expect(
      isPluginActive({
        id: "x",
        enabled: true,
        loaded: true,
      })
    ).toBe(true);
  });
});
