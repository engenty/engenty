import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockParse, constructConfigs } = vi.hoisted(() => {
  const constructConfigs: Record<string, unknown>[] = [];
  const mockParse = vi.fn();
  return { mockParse, constructConfigs };
});

vi.mock("@llamaindex/liteparse", () => ({
  LiteParse: class MockLiteParse {
    constructor(config: Record<string, unknown>) {
      constructConfigs.push(config);
    }
    parse = mockParse;
  },
}));

describe("LiteParseProvider", () => {
  beforeEach(() => {
    mockParse.mockReset();
    constructConfigs.length = 0;
    mockParse.mockResolvedValue({
      text: "Hello world\n\nSecond line",
      pages: [{ pageNum: 1 }, { pageNum: 2 }],
    });
  });

  it("maps result.text to markdown and metadata", async () => {
    const { LiteParseProvider } = await import("./index.js");
    const p = new LiteParseProvider();
    const data = new Uint8Array([1, 2, 3]);
    const r = await p.convert(data, "doc.pdf", "application/pdf");
    expect(r.markdown).toBe("Hello world\n\nSecond line");
    expect(r.metadata.page_count).toBe(2);
    expect(r.metadata.word_count).toBeGreaterThan(0);
    expect(r.source.filename).toBe("doc.pdf");
    expect(mockParse).toHaveBeenCalledWith(data);
    expect(constructConfigs[0]).toMatchObject({ outputFormat: "text" });
  });

  it("passes max_pages into LiteParse config", async () => {
    const { LiteParseProvider } = await import("./index.js");
    const p = new LiteParseProvider();
    await p.convert(new Uint8Array([1]), "a.pdf", "application/pdf", {
      max_pages: 5,
    });
    expect(constructConfigs[0]).toMatchObject({
      outputFormat: "text",
      maxPages: 5,
    });
  });

  it("passes language hint to ocrLanguage", async () => {
    const { LiteParseProvider } = await import("./index.js");
    const p = new LiteParseProvider();
    await p.convert(new Uint8Array([1]), "a.pdf", "application/pdf", {
      language: "fra",
    });
    expect(constructConfigs[0]).toMatchObject({
      ocrLanguage: "fra",
    });
  });
});
