/**
 * KB inbox — schema contracts (zod).
 */

import { describe, expect, it } from "vitest";
import {
  inboxFetchSourceBodySchema,
  inboxItemCreateSchema,
  inboxItemUpdateSchema,
  inboxPromoteBatchBodySchema,
  inboxPromoteSchema,
  inboxQuerySchema,
} from "../src/schema/inbox.js";

describe("inboxItemCreateSchema", () => {
  it("accepts minimal create payload", () => {
    const r = inboxItemCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Note from standup",
      source_type: "paste",
      raw_markdown: "## Decisions\n- …",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty title", () => {
    const r = inboxItemCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("inboxQuerySchema", () => {
  it("defaults pagination and sort", () => {
    const r = inboxQuerySchema.parse({ kb_id: "kb-1" });
    expect(r.page).toBe(1);
    expect(r.page_size).toBe(25);
    expect(r.sort_by).toBe("captured_at");
    expect(r.sort_order).toBe("desc");
  });
});

describe("inboxItemUpdateSchema", () => {
  it("allows triage fields", () => {
    const r = inboxItemUpdateSchema.safeParse({
      status: "triaged",
      triage_summary: "Summary here",
    });
    expect(r.success).toBe(true);
  });
});

describe("inboxFetchSourceBodySchema", () => {
  it("defaults force to false", () => {
    const r = inboxFetchSourceBodySchema.parse({});
    expect(r.force).toBe(false);
  });

  it("accepts force true", () => {
    const r = inboxFetchSourceBodySchema.parse({ force: true });
    expect(r.force).toBe(true);
  });
});

describe("inboxPromoteSchema", () => {
  it("accepts article promote defaults", () => {
    const r = inboxPromoteSchema.safeParse({
      target: "article",
      content_markdown: "# Draft\n",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("draft");
    }
  });

  it("accepts faq promote with question", () => {
    const r = inboxPromoteSchema.safeParse({
      target: "faq",
      question: "How do I …?",
      content_markdown: "Answer…",
    });
    expect(r.success).toBe(true);
  });
});

describe("inboxPromoteBatchBodySchema", () => {
  it("accepts parent chain via parent_step_index", () => {
    const r = inboxPromoteBatchBodySchema.safeParse({
      primary_index: 0,
      steps: [
        { title: "Parent", content_markdown: "# P" },
        {
          title: "Child",
          content_markdown: "# C",
          parent_step_index: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects parent_step_index pointing at same or later step", () => {
    const r = inboxPromoteBatchBodySchema.safeParse({
      steps: [{ title: "A", parent_step_index: 0 }, { title: "B" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects both parent_article_id and parent_step_index", () => {
    const r = inboxPromoteBatchBodySchema.safeParse({
      steps: [
        {
          title: "X",
          parent_article_id: "art-1",
          parent_step_index: 0,
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
