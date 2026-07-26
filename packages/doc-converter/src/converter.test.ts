import { afterEach, describe, expect, it, vi } from "vitest";

describe("Converter", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    vi.resetModules();
  });

  it("registers local + liteparse when no cloud keys are set", async () => {
    Reflect.deleteProperty(process.env, "LLAMA_CLOUD_API_KEY");
    Reflect.deleteProperty(process.env, "MISTRAL_API_KEY");
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    const c = new C();
    const ids = c
      .listProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["liteparse", "local"]);
  });

  it("registers llamaparse when LLAMA_CLOUD_API_KEY is set", async () => {
    process.env.LLAMA_CLOUD_API_KEY = "lk-test";
    Reflect.deleteProperty(process.env, "MISTRAL_API_KEY");
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    const c = new C();
    const ids = c
      .listProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["liteparse", "llamaparse", "local"]);
  });

  it("registers gemini when AI_GATEWAY_API_KEY is set", async () => {
    Reflect.deleteProperty(process.env, "LLAMA_CLOUD_API_KEY");
    Reflect.deleteProperty(process.env, "MISTRAL_API_KEY");
    process.env.AI_GATEWAY_API_KEY = "gk-test";
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    const c = new C();
    const ids = c
      .listProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["gemini", "liteparse", "local"]);
  });

  it("registers mistral when MISTRAL_API_KEY is set", async () => {
    Reflect.deleteProperty(process.env, "LLAMA_CLOUD_API_KEY");
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    process.env.MISTRAL_API_KEY = "mk-test";
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    const c = new C();
    const ids = c
      .listProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(["liteparse", "local", "mistral"]);
  });

  it("prefers vision (gemini) over local OCR (liteparse) for images so ImageMagick isn't needed", async () => {
    Reflect.deleteProperty(process.env, "LLAMA_CLOUD_API_KEY");
    Reflect.deleteProperty(process.env, "MISTRAL_API_KEY");
    process.env.AI_GATEWAY_API_KEY = "gk-test";
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    // preferred = local (default); local can't do images, so it falls back.
    const c = new C();
    const gemini = c.listProviders().find((p) => p.id === "gemini");
    expect(gemini?.types).toContain("image/png");
    const geminiMod = await import("./providers/gemini/index.js");
    const spy = vi
      .spyOn(geminiMod.GeminiProvider.prototype, "convert")
      .mockResolvedValue({
        markdown: "vision text",
        metadata: {},
        source: {
          filename: "logo.png",
          mime_type: "image/png",
          size_bytes: 3,
        },
      });
    const liteparseMod = await import("./providers/liteparse/index.js");
    const liteSpy = vi.spyOn(
      liteparseMod.LiteParseProvider.prototype,
      "convert"
    );
    const r = await c.convert(
      new Uint8Array([1, 2, 3]),
      "logo.png",
      "image/png"
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(liteSpy).not.toHaveBeenCalled();
    expect(r.markdown).toBe("vision text");
  });

  it("falls back from preferred cloud to local when mime is unsupported", async () => {
    process.env.LLAMA_CLOUD_API_KEY = "lk-test";
    Reflect.deleteProperty(process.env, "MISTRAL_API_KEY");
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    vi.resetModules();
    const { Converter: C } = await import("./converter.js");
    const c = new C({ provider: "llamaparse" });
    const r = await c.convert(
      new TextEncoder().encode("hello"),
      "note.txt",
      "text/plain"
    );
    expect(r.markdown).toContain("hello");
    expect(r.source.mime_type).toBe("text/plain");
  });
});
