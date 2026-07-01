import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertFirecrawlIngestStrategyConfigured,
  assertSourceAdapterRunReady,
  hashDocumentSourceItemContent,
  isFirecrawlApiKeyConfigured,
  parseHttpIngestStrategyFromSettings,
  readHtmlExtractFromSourceSettings,
  retrieveUrlItem,
} from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("parseHttpIngestStrategyFromSettings", () => {
  it("defaults when strategy is missing", () => {
    expect(
      parseHttpIngestStrategyFromSettings({ url: "https://a.test/" })
    ).toBe("auto");
  });

  it("accepts auto, fetch, and firecrawl", () => {
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: "auto",
        url: "https://a.test/",
      })
    ).toBe("auto");
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: "fetch",
        url: "https://a.test/",
      })
    ).toBe("fetch");
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: "firecrawl",
        url: "https://a.test/",
      })
    ).toBe("firecrawl");
  });

  it("treats null and empty string as default", () => {
    expect(
      parseHttpIngestStrategyFromSettings({ strategy: null, url: "https://x/" })
    ).toBe("auto");
    expect(
      parseHttpIngestStrategyFromSettings({ strategy: "", url: "https://x/" })
    ).toBe("auto");
  });

  it("coerces unknown strategy strings to default auto", () => {
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: "headless",
        url: "https://x/",
      })
    ).toBe("auto");
  });

  it("coerces non-string strategy (corrupt JSON) to auto", () => {
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: [{ code: "invalid_value" }],
        url: "https://x/",
      })
    ).toBe("auto");
  });

  it("coerces Zod-issue-shaped array strategy to auto (regression)", () => {
    const zodLike = [
      {
        code: "invalid_value",
        message: 'Invalid option: expected one of "auto"|"fetch"|"firecrawl"',
        path: [],
        values: ["auto", "fetch", "firecrawl"],
      },
    ];
    expect(
      parseHttpIngestStrategyFromSettings({
        strategy: zodLike,
        sitemap_url: "https://example.com/s.xml",
      })
    ).toBe("auto");
  });
});

describe("readHtmlExtractFromSourceSettings", () => {
  it("returns empty extract when html_extract_use_defaults_only", () => {
    expect(
      readHtmlExtractFromSourceSettings({
        html_extract_use_defaults_only: true,
      })
    ).toEqual({});
  });

  it("maps html_extract_suggest_patterns_with_llm to suggestPatternsWithLlm", () => {
    expect(
      readHtmlExtractFromSourceSettings({
        html_extract_suggest_patterns_with_llm: true,
      })
    ).toEqual({ suggestPatternsWithLlm: true });
    expect(
      readHtmlExtractFromSourceSettings({
        html_extract_llm_model: " openai/gpt-5-mini ",
        html_extract_suggest_patterns_with_llm: true,
      })
    ).toEqual({
      llmModel: "openai/gpt-5-mini",
      suggestPatternsWithLlm: true,
    });
  });

  it("prefers LLM auto over defaults-only when both are set", () => {
    expect(
      readHtmlExtractFromSourceSettings({
        html_extract_suggest_patterns_with_llm: true,
        html_extract_use_defaults_only: true,
      })
    ).toEqual({ suggestPatternsWithLlm: true });
  });

  it("returns undefined when no extract keys", () => {
    expect(
      readHtmlExtractFromSourceSettings({ url: "https://x/" })
    ).toBeUndefined();
  });

  it("reads include and exclude selector arrays", () => {
    expect(
      readHtmlExtractFromSourceSettings({
        html_exclude_selectors: [".ad", "footer"],
        html_include_selectors: ["main", "article"],
      })
    ).toEqual({
      excludeSelectors: [".ad", "footer"],
      includeSelectors: ["main", "article"],
      skipDefaultExcludeSelectors: false,
    });
  });
});

describe("retrieveUrlItem", () => {
  it("applies default HTML excludes without source-specific extract settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `<!DOCTYPE html><html><body>
              <main><h1>Article</h1><p>Important article body</p></main>
              <div id="BorlabsCookieBox">Ich stimme allen Cookies zu</div>
            </body></html>`,
            {
              headers: {
                "content-type": "text/html; charset=utf-8",
              },
            }
          )
      )
    );

    const item = await retrieveUrlItem(
      {
        adapter_id: "url",
        id: "source-1",
        missing_item_strategy: "ignore",
        name: "Article",
        schedule: {
          enabled: false,
          interval_minutes: null,
          kind: "interval",
          timezone: "UTC",
        },
        settings: { strategy: "fetch" },
      },
      {
        item_key: "https://example.com/article",
        source_url: "https://example.com/article",
      }
    );

    expect(item.markdown).toContain("Important article body");
    expect(item.markdown).not.toContain("Ich stimme allen Cookies zu");
    expect(item.raw_html).toContain("BorlabsCookieBox");
    expect(item.sections?.length).toBeGreaterThan(0);
    expect(item.title).toBe("Article");
  });

  it("captures raw HTML with a direct fetch when Firecrawl returns markdown only", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              markdown: "# Article\n\nBody",
              metadata: { sourceURL: "https://example.com/article" },
            },
            success: true,
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          `<!DOCTYPE html><html><body>
            <main><h1>Article</h1><p>Body</p></main>
            <div class="_brlbs-box">Borlabs Cookie</div>
          </body></html>`,
          {
            headers: { "content-type": "text/html; charset=utf-8" },
            status: 200,
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const item = await retrieveUrlItem(
      {
        adapter_id: "url",
        id: "source-1",
        missing_item_strategy: "ignore",
        name: "Article",
        schedule: {
          enabled: false,
          interval_minutes: null,
          kind: "interval",
          timezone: "UTC",
        },
        settings: { strategy: "firecrawl" },
      },
      {
        item_key: "https://example.com/article",
        source_url: "https://example.com/article",
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(item.markdown).toContain("Body");
    expect(item.raw_html).toContain("_brlbs-box");
  });
});

describe("hashDocumentSourceItemContent", () => {
  const baseItem = {
    content_type: "text/html",
    final_url: "https://example.com/a",
    item_key: "https://example.com/a",
    markdown: "Body",
    provider: "fetch",
    source_url: "https://example.com/a",
  };

  it("changes when media inventory changes", () => {
    const withoutMedia = hashDocumentSourceItemContent(baseItem);
    const withMedia = hashDocumentSourceItemContent({
      ...baseItem,
      media: [
        {
          media_type: "image",
          position: 0,
          source_url: "https://example.com/a.png",
        },
      ],
    });

    expect(withMedia).not.toBe(withoutMedia);
  });
});

describe("assertFirecrawlIngestStrategyConfigured", () => {
  it("allows auto without FIRECRAWL_API_KEY", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(() =>
      assertFirecrawlIngestStrategyConfigured({ strategy: "auto" })
    ).not.toThrow();
  });

  it("throws for firecrawl when FIRECRAWL_API_KEY is missing", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(() =>
      assertFirecrawlIngestStrategyConfigured({ strategy: "firecrawl" })
    ).toThrow(/FIRECRAWL_API_KEY/);
  });

  it("passes for firecrawl when key is configured", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    expect(isFirecrawlApiKeyConfigured()).toBe(true);
    expect(() =>
      assertFirecrawlIngestStrategyConfigured({ strategy: "firecrawl" })
    ).not.toThrow();
  });
});

describe("assertSourceAdapterRunReady", () => {
  it("validates sitemap firecrawl strategy on run", () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(() =>
      assertSourceAdapterRunReady("sitemap", { strategy: "firecrawl" })
    ).toThrow(/FIRECRAWL_API_KEY/);
  });
});

describe("retrieveUrlItem auto strategy", () => {
  it("uses fetch provider even when FIRECRAWL_API_KEY is set", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<!DOCTYPE html><html><body><main><h1>Hi</h1></main></body></html>",
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const item = await retrieveUrlItem(
      {
        adapter_id: "sitemap",
        id: "source-1",
        missing_item_strategy: "ignore",
        name: "Sitemap",
        schedule: {
          enabled: false,
          interval_minutes: null,
          kind: "interval",
          timezone: "UTC",
        },
        settings: {
          strategy: "auto",
          sitemap_url: "https://example.com/s.xml",
        },
      },
      {
        item_key: "https://example.com/page",
        source_url: "https://example.com/page",
      }
    );

    expect(item.provider).toBe("fetch");
    expect(item.markdown).toContain("Hi");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("firecrawl");
  });
});
