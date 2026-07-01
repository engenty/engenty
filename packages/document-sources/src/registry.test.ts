import { afterEach, describe, expect, it, vi } from "vitest";
import { hashDocumentSourceWebhookToken } from "./digest.js";
import { defaultDocumentSourceAdapterRegistry } from "./registry.js";
import { computeDocumentSourceNextRunAt } from "./schedule.js";
import type { DocumentSource } from "./types.js";

function source(partial: Partial<DocumentSource>): DocumentSource {
  return {
    adapter_id: "url",
    id: "source-1",
    missing_item_strategy: "ignore",
    name: "Docs",
    schedule: {
      enabled: false,
      interval_minutes: null,
      kind: "interval",
      timezone: "UTC",
    },
    settings: {},
    ...partial,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaultDocumentSourceAdapterRegistry", () => {
  it("lists the v1 web adapters", () => {
    expect(
      defaultDocumentSourceAdapterRegistry.listDescriptors().map((a) => a.id)
    ).toEqual([
      "url",
      "firecrawl_url",
      "sitemap",
      "web_index",
      "manual",
      "file_upload",
    ]);
  });

  it("builds a single URL source item", async () => {
    const adapter = defaultDocumentSourceAdapterRegistry.get("url");
    const index = await adapter.createIndex(
      source({ settings: { url: "https://example.com/docs" } })
    );

    expect(index.entries).toEqual([
      {
        item_key: "https://example.com/docs",
        locator: "https://example.com/docs",
        source_url: "https://example.com/docs",
        title: "Docs",
      },
    ]);
    expect(index.total).toBe(1);
  });

  it("parses sitemap loc entries into source items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "<urlset><url><loc>https://example.com/a</loc></url></urlset>"
          )
      )
    );
    const adapter = defaultDocumentSourceAdapterRegistry.get("sitemap");
    const index = await adapter.createIndex(
      source({
        adapter_id: "sitemap",
        settings: { sitemap_url: "https://example.com/sitemap.xml" },
      })
    );

    expect(index.entries[0]?.source_url).toBe("https://example.com/a");
  });

  it("tolerates corrupt strategy JSON on sitemap settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "<urlset><url><loc>https://example.com/a</loc></url></urlset>"
          )
      )
    );
    const adapter = defaultDocumentSourceAdapterRegistry.get("sitemap");
    const index = await adapter.createIndex(
      source({
        adapter_id: "sitemap",
        settings: {
          sitemap_url: "https://example.com/sitemap.xml",
          strategy: [{ code: "invalid_value", path: [] }],
        },
      })
    );

    expect(index.entries[0]?.source_url).toBe("https://example.com/a");
  });
});

describe("digest and schedule helpers", () => {
  it("hashes webhook tokens deterministically without exposing the token", () => {
    const hash = hashDocumentSourceWebhookToken("token-123");

    expect(hash).toBe(hashDocumentSourceWebhookToken("token-123"));
    expect(hash).not.toContain("token-123");
  });

  it("computes the next run from interval schedules", () => {
    expect(
      computeDocumentSourceNextRunAt(
        {
          schedule: {
            enabled: true,
            interval_minutes: 30,
            kind: "interval",
            timezone: "UTC",
          },
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toBe("2026-01-01T00:30:00.000Z");
  });
});
