import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dropNullArgs,
  isZodFrontendToolConfig,
  toAgentUiFrontendToolHandler,
} from "./zod-frontend-tool.js";

const themeConfig = {
  description: "Switch the app color theme.",
  handler: async ({ theme }: { theme: "light" | "dark" | "system" }) => ({
    ok: true,
    theme,
  }),
  name: "shell_set_theme",
  safety: "safe" as const,
  schema: z.object({ theme: z.enum(["light", "dark", "system"]) }),
  title: "Set theme",
};

const request = {
  call_id: "c1",
  input: { theme: "dark" },
  run_id: "r1",
  tool_name: "shell_set_theme",
};

describe("toAgentUiFrontendToolHandler", () => {
  it("parses input and passes typed args to the handler", async () => {
    const handler = toAgentUiFrontendToolHandler(themeConfig);
    await expect(handler({ theme: "dark" }, request)).resolves.toEqual({
      ok: true,
      theme: "dark",
    });
  });

  it("throws on invalid input (surfaced as a tool error by the harness)", () => {
    const handler = toAgentUiFrontendToolHandler(themeConfig);
    expect(() => handler({ theme: "neon" }, request)).toThrow();
  });

  it("tolerates a model-supplied null for an optional arg", async () => {
    const domConfig = {
      description: "Snapshot the DOM.",
      handler: async ({ root_selector }: { root_selector?: string }) => ({
        root: root_selector ?? "body",
      }),
      name: "browser_dom_snapshot",
      safety: "safe" as const,
      schema: z.object({ root_selector: z.string().optional() }),
      title: "DOM Snapshot",
    };
    const handler = toAgentUiFrontendToolHandler(domConfig);
    // The model passes `root_selector: null` for the unused optional field —
    // must NOT throw (previously a ZodError → "User rejected").
    await expect(handler({ root_selector: null }, request)).resolves.toEqual({
      root: "body",
    });
  });
});

describe("dropNullArgs", () => {
  it("drops null keys (treated as absent) but keeps other values, recursively", () => {
    expect(
      dropNullArgs({ a: null, b: 1, c: { d: null, e: "x" }, f: [{ g: null }] })
    ).toEqual({ b: 1, c: { e: "x" }, f: [{}] });
  });
});

describe("isZodFrontendToolConfig", () => {
  it("recognizes the zod config form and rejects the low-level definition", () => {
    expect(isZodFrontendToolConfig(themeConfig)).toBe(true);
    expect(
      isZodFrontendToolConfig({ name: "x", parameters: {}, metadata: {} })
    ).toBe(false);
  });
});
