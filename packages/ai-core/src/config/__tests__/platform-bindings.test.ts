import { afterEach, describe, expect, it } from "vitest";
import { bindingsFromList } from "../model-roles.js";
import { readPlatformBindings, roleModelRef } from "../platform-bindings.js";
import { setPlatformBindings } from "../platform-bindings-snapshot.js";

function serviceDbWith(rows: unknown[] | null, error: unknown = null) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: rows, error }),
        }),
      }),
    }),
  };
}

describe("roleModelRef", () => {
  afterEach(() => setPlatformBindings(undefined));

  it("returns the bound ref, gateway head only off the default gateway", () => {
    const bindings = bindingsFromList([
      {
        gateway: "vercel",
        modelId: "openai/text-embedding-3-large",
        role: "embedding",
      },
      { gateway: "openrouter", modelId: "google/gemini-img", role: "image" },
    ]);
    expect(roleModelRef("embedding", bindings)).toBe(
      "openai/text-embedding-3-large"
    );
    expect(roleModelRef("image", bindings)).toBe(
      "openrouter:google/gemini-img"
    );
  });

  it("reads the process snapshot by default", () => {
    setPlatformBindings(
      bindingsFromList([
        { gateway: "vercel", modelId: "openai/x", role: "embedding" },
      ])
    );
    expect(roleModelRef("embedding")).toBe("openai/x");
  });

  it("throws when unbound or before the snapshot loads", () => {
    expect(() => roleModelRef("embedding")).toThrow("before the platform");
    setPlatformBindings(
      bindingsFromList([{ gateway: "vercel", modelId: "x", role: "image" }])
    );
    expect(() => roleModelRef("embedding")).toThrow("is not bound");
  });
});

describe("readPlatformBindings", () => {
  it("reads platform rows into bindings", async () => {
    const bindings = await readPlatformBindings(
      serviceDbWith([
        {
          gateway: null,
          model_id: "google/gemini-2.5-flash-image",
          role: "image",
        },
      ])
    );
    expect(bindings?.get("image")).toEqual({
      gateway: "vercel",
      modelId: "google/gemini-2.5-flash-image",
      role: "image",
    });
  });

  it("is undefined without a client or rows, and throws on a read error", async () => {
    expect(await readPlatformBindings(null)).toBeUndefined();
    expect(await readPlatformBindings(serviceDbWith([]))).toBeUndefined();
    await expect(
      readPlatformBindings(serviceDbWith(null, new Error("down")))
    ).rejects.toThrow("down");
  });
});
