import { describe, expect, it, vi } from "vitest";
import type { KbRepoFactory } from "../src/dal/contracts.js";
import { resolveKbArticleDataSourceLink } from "../src/services/kb-article-data-source-link.js";

function reposStub(partial: Partial<KbRepoFactory>): KbRepoFactory {
  return partial as KbRepoFactory;
}

describe("resolveKbArticleDataSourceLink", () => {
  it("returns one-to-one link when article URL matches a source item", async () => {
    const findSourceItemBySourceUrl = vi.fn().mockResolvedValue({
      source_id: "019e7ce0-9a5d-71d7-820b-b036a6f47f7d",
    });

    const result = await resolveKbArticleDataSourceLink(
      reposStub({
        inbox: { getById: vi.fn() },
        sources: {
          findSourceItemBySourceUrl,
          findSourceItemByInboxItemId: vi.fn(),
          getById: vi.fn().mockResolvedValue({
            id: "019e7ce0-9a5d-71d7-820b-b036a6f47f7d",
            name: "waff course sitemap",
          }),
        },
      }),
      {
        kb_id: "kb1",
        original_document_url: "https://www.waff.at/ausbildung/pflege",
      },
      []
    );

    expect(result).toEqual({
      id: "019e7ce0-9a5d-71d7-820b-b036a6f47f7d",
      name: "waff course sitemap",
      one_to_one: true,
      source_url: "https://www.waff.at/ausbildung/pflege",
    });
  });

  it("returns generic link when inbox maps to source without item match", async () => {
    const result = await resolveKbArticleDataSourceLink(
      reposStub({
        inbox: {
          getById: vi.fn().mockResolvedValue({
            linked_kb_source_id: "source-1",
            source_url: null,
          }),
        },
        sources: {
          findSourceItemBySourceUrl: vi.fn(),
          findSourceItemByInboxItemId: vi.fn().mockResolvedValue(null),
          getById: vi.fn().mockResolvedValue({
            id: "source-1",
            name: "Manual capture source",
          }),
        },
      }),
      { kb_id: "kb1", original_document_url: null },
      [
        {
          id: "ref-1",
          tenant_id: "t1",
          scope_id: "s1",
          article_id: "a1",
          faq_id: null,
          inbox_item_id: "inbox-1",
          excerpt: null,
          locator: null,
          source_url: null,
          original_storage_path: null,
          created_at: "",
        },
      ]
    );

    expect(result).toEqual({
      id: "source-1",
      name: "Manual capture source",
      one_to_one: false,
      source_url: null,
    });
  });
});
