import { describe, expect, it } from "vitest";
import {
  formatArticleSourceDisplayUrl,
  resolveArticleSourceProvenance,
} from "../ui/lib/article-source-provenance.js";

describe("resolveArticleSourceProvenance", () => {
  it("uses API kb_data_source when present", () => {
    expect(
      resolveArticleSourceProvenance(
        {
          original_document_url: "https://www.waff.at/ausbildung/pflege",
          kb_data_source: {
            id: "source-1",
            name: "waff course sitemap",
            one_to_one: true,
            source_url: "https://www.waff.at/ausbildung/pflege",
          },
        },
        []
      )
    ).toEqual({
      kbSourceId: "source-1",
      kbSourceName: "waff course sitemap",
      oneToOne: true,
      sourceUrl: "https://www.waff.at/ausbildung/pflege",
    });
  });

  it("falls back to URL-only provenance without API enrichment", () => {
    expect(
      resolveArticleSourceProvenance(
        {
          original_document_url: "https://www.waff.at/ausbildung/pflege",
          kb_data_source: null,
        },
        []
      )
    ).toEqual({
      kbSourceId: null,
      kbSourceName: null,
      oneToOne: false,
      sourceUrl: "https://www.waff.at/ausbildung/pflege",
    });
  });

  it("ignores vault storage paths on original_document_url", () => {
    expect(
      resolveArticleSourceProvenance(
        {
          original_document_url:
            "tenants/t1/knowledge-base/default/uploads/file.pdf",
          kb_data_source: null,
        },
        []
      )
    ).toBeNull();
  });
});

describe("formatArticleSourceDisplayUrl", () => {
  it("shortens long URLs to hostname and path", () => {
    expect(
      formatArticleSourceDisplayUrl(
        "https://www.waff.at/ausbildung/pflege/heimhelfer"
      )
    ).toBe("waff.at/ausbildung/pflege/heimhelfer");
  });
});
