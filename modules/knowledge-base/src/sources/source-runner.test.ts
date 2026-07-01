import type {
  DocumentSourceAdapter,
  DocumentSourceAdapterRegistry,
} from "@engenty/document-sources";
import { describe, expect, it, vi } from "vitest";
import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  InboxItem,
  KbSource,
  KbSourceItem,
  KbSourceRun,
} from "../schema/types.js";
import { runKbSource } from "./source-runner.js";

function sourceFixture(settings: Record<string, unknown> = {}): KbSource {
  return {
    adapter_id: "url",
    created_at: "2026-05-04T00:00:00.000Z",
    created_by: null,
    enabled: true,
    id: "source-1",
    kb_id: "kb-1",
    last_error: null,
    last_run_at: null,
    last_run_status: null,
    missing_item_strategy: "ignore",
    name: "Source",
    next_run_at: null,
    schedule: {
      cron_expression: null,
      enabled: false,
      interval_minutes: null,
      kind: "interval",
      timezone: "UTC",
    },
    scope_id: "scope-1",
    settings,
    status: "active",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    updated_at: "2026-05-04T00:00:00.000Z",
    webhook_token_hash: null,
  };
}

describe("runKbSource structured item persistence", () => {
  it("persists retrieved sections, media, and links", async () => {
    const source = sourceFixture({ media_capture_mode: "catalog" });
    const run: KbSourceRun = {
      completed_at: null,
      created_items: 0,
      error: null,
      id: "run-1",
      kb_id: source.kb_id,
      metadata: {},
      scope_id: source.scope_id,
      skipped_items: 0,
      source_id: source.id,
      started_at: "2026-05-04T00:00:00.000Z",
      status: "running",
      tenant_id: source.tenant_id,
      trigger: "manual",
      updated_items: 0,
    };
    const inbox: InboxItem = {
      created_at: "2026-05-04T00:00:00.000Z",
      created_by: null,
      id: "inbox-1",
      kb_id: source.kb_id,
      metadata: {},
      original_storage_path: null,
      raw_markdown: "Body",
      raw_text: "<main>Body</main>",
      scope_id: source.scope_id,
      source_type: "url",
      source_url: "https://example.com/a",
      status: "new",
      tenant_id: source.tenant_id,
      title: "Item",
      triage_metadata: {},
      triage_summary: null,
      updated_at: "2026-05-04T00:00:00.000Z",
    };
    const item: KbSourceItem = {
      adapter_item_key: "https://example.com/a",
      content_hash: "hash",
      created_at: "2026-05-04T00:00:00.000Z",
      first_seen_at: "2026-05-04T00:00:00.000Z",
      id: "item-1",
      inbox_item_id: inbox.id,
      kb_id: source.kb_id,
      last_seen_at: "2026-05-04T00:00:00.000Z",
      locator: null,
      metadata: {},
      missing_since: null,
      scope_id: source.scope_id,
      source_id: source.id,
      source_url: "https://example.com/a",
      status: "active",
      tenant_id: source.tenant_id,
      title: "Item",
      updated_at: "2026-05-04T00:00:00.000Z",
    };
    const persisted = {
      links: [] as unknown[],
      media: [] as unknown[],
      sections: [] as unknown[],
    };
    const repos = {
      activity_log: { append: vi.fn(async () => ({})) },
      inbox: {
        create: vi.fn(async () => inbox),
        getById: vi.fn(),
        update: vi.fn(),
      },
      sources: {
        createRun: vi.fn(async () => run),
        getById: vi.fn(async () => source),
        getRunById: vi.fn(async () => null),
        getRunningRun: vi.fn(async () => null),
        getSourceItemByKey: vi.fn(async () => null),
        listItemsPaginated: vi.fn(async () => ({
          data: [item],
          page: 1,
          page_size: 200,
          total: 1,
        })),
        replaceSourceItemLinks: vi.fn(async (_id, links) => {
          persisted.links = links;
          return [];
        }),
        replaceSourceItemMedia: vi.fn(async (_id, media) => {
          persisted.media = media;
          return [];
        }),
        replaceSourceItemSections: vi.fn(async (_id, sections) => {
          persisted.sections = sections;
          return [];
        }),
        update: vi.fn(async (_id, patch) => ({ ...source, ...patch })),
        updateRun: vi.fn(async (_id, patch) => ({ ...run, ...patch })),
        updateSourceItem: vi.fn(async (_id, patch) => ({ ...item, ...patch })),
        upsertSourceItem: vi.fn(async () => item),
      },
    } as unknown as KbRepoFactory;

    const adapter: DocumentSourceAdapter = {
      createIndex: vi.fn(async () => ({
        entries: [
          {
            item_key: "https://example.com/a",
            source_url: "https://example.com/a",
            title: "Item",
          },
        ],
        total: 1,
      })),
      descriptor: {
        id: "url",
        index_mode: "single",
        label: "URL",
        missing_item_strategies: ["ignore"],
        schedule_default_minutes: null,
        settings_fields: [],
      },
      retrieveItem: vi.fn(async () => ({
        content_type: "text/html",
        final_url: "https://example.com/a",
        item_key: "https://example.com/a",
        links: [
          {
            href: "/b",
            link_type: "internal",
            normalized_href: "https://example.com/b",
            position: 0,
          },
        ],
        markdown: "Body",
        media: [
          {
            media_type: "image",
            position: 0,
            source_url: "https://example.com/image.png",
          },
        ],
        provider: "fetch",
        sections: [
          {
            content: "Body",
            kind: "markdown",
            locator: "markdown",
            position: 0,
          },
        ],
        source_url: "https://example.com/a",
        title: "Item",
      })),
      settingsSchema: { parse: (value: unknown) => value },
    } as unknown as DocumentSourceAdapter;
    const registry = {
      get: vi.fn(() => adapter),
    } as unknown as DocumentSourceAdapterRegistry;

    const result = await runKbSource(repos, source.id, { registry });

    expect(result.run.status).toBe("succeeded");
    expect(persisted.sections).toHaveLength(1);
    expect(persisted.media).toMatchObject([
      {
        download_status: "external",
        media_type: "image",
        source_url: "https://example.com/image.png",
      },
    ]);
    expect(persisted.links).toMatchObject([
      {
        link_type: "internal",
        normalized_href: "https://example.com/b",
      },
    ]);
    expect(repos.sources.updateSourceItem).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          link_count: 1,
          media_count: 1,
          section_count: 1,
        }),
      })
    );
  });
});
