import { describe, expect, it } from "vitest";
import {
  articleSnapshotToRestorePatch,
  articleToVersionSnapshot,
} from "./kb-version-snapshots.js";

describe("articleSnapshotToRestorePatch", () => {
  it("maps snapshot fields back to an update patch", () => {
    const snapshot = articleToVersionSnapshot({
      category_id: "cat-1",
      content_json: { type: "doc", content: [] },
      content_markdown: "# Hello",
      created_at: "2026-01-01T00:00:00Z",
      created_by: null,
      custom_properties: { role: "guide" },
      deleted_at: null,
      id: "art-1",
      kb_id: "kb-1",
      locked_at: null,
      original_document_name: null,
      original_document_url: null,
      parent_article_id: null,
      published_at: null,
      questions_answered: ["What?"],
      scope_id: "scope-1",
      slug: "hello",
      sort_order: 2,
      status: "draft",
      summary: "Short",
      tenant_id: "tenant-1",
      title: "Hello",
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: null,
      tags: [
        {
          id: "tag-1",
          kb_id: "kb-1",
          name: "x",
          slug: "x",
          color: null,
          created_at: "2026-01-01T00:00:00Z",
          scope_id: "scope-1",
          tenant_id: "tenant-1",
        },
      ],
    });

    expect(articleSnapshotToRestorePatch(snapshot)).toEqual({
      patch: {
        title: "Hello",
        slug: "hello",
        status: "draft",
        parent_article_id: null,
        content_markdown: "# Hello",
        content_json: { type: "doc", content: [] },
        summary: "Short",
        questions_answered: ["What?"],
        sort_order: 2,
        original_document_url: null,
        original_document_name: null,
        custom_properties: { role: "guide" },
      },
      tag_ids: ["tag-1"],
    });
  });

  it("returns null when title is missing", () => {
    expect(articleSnapshotToRestorePatch({ slug: "x" })).toBeNull();
  });
});
