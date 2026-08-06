import { describe, expect, it } from "vitest";
import {
  collectToolImages,
  detectToolOutputError,
  extractProseSnippet,
  summarizeToolStepBrief,
  unwrapEngentyToolExecuteOutput,
} from "./tool-call-card-utils";

describe("detectToolOutputError", () => {
  it("reads a top-level Zod issue array", () => {
    expect(
      detectToolOutputError([
        {
          expected: "string",
          code: "invalid_type",
          path: ["inbox_id"],
          message: "Invalid input: expected string, received undefined",
        },
      ])
    ).toBe("Invalid input: expected string, received undefined");
  });

  it("reads issues nested under errors/issues and ok:false", () => {
    expect(
      detectToolOutputError({
        issues: [{ code: "custom", path: [], message: "bad" }],
      })
    ).toBe("bad");
    expect(detectToolOutputError({ ok: false, error: "boom" })).toBe("boom");
  });

  it("returns null for normal output", () => {
    expect(
      detectToolOutputError({ total: 4, results: [{ id: "x" }] })
    ).toBeNull();
    expect(detectToolOutputError([{ id: "x", title: "ok" }])).toBeNull();
  });
});

describe("extractProseSnippet", () => {
  it("returns a real sentence from a prose field", () => {
    expect(
      extractProseSnippet({ message: "Catalog discovery completed." })
    ).toBe("Catalog discovery completed.");
  });

  it("skips ID dumps and bare tokens (no whitespace / no prose field)", () => {
    expect(
      extractProseSnippet({ data: [{ id: "019ed1d2" }], total: 4 })
    ).toBeNull();
    expect(extractProseSnippet({ summary: "019ed1d2-9a51" })).toBeNull();
  });

  it("skips stringified JSON blobs from AG-UI tool results", () => {
    const blob = JSON.stringify({
      ok: true,
      data: { results: [{ item: { match_reason: "semantic" } }] },
    });
    expect(extractProseSnippet(blob)).toBeNull();
    expect(
      extractProseSnippet({
        ok: true,
        data: { results: [{ item: { message: { body_html: "<p>x</p>" } } }] },
      })
    ).toBeNull();
  });

  it("unwraps MCP-style content arrays (imported connectors, MCP apps)", () => {
    expect(
      extractProseSnippet({
        content: [
          { type: "image", data: "…" },
          { type: "text", text: "Available pages for vercel/next.js:\n- 1" },
        ],
      })
    ).toBe("Available pages for vercel/next.js:\n- 1");
    expect(
      extractProseSnippet({ content: [{ type: "text", text: "id1" }] })
    ).toBeNull();
  });
});

describe("collectToolImages", () => {
  it("finds image URLs under common keys and dedupes them", () => {
    expect(
      collectToolImages({
        image_url: "https://x.com/avatar.png",
        nested: { screenshot: "https://x.com/avatar.png" },
      })
    ).toEqual([{ url: "https://x.com/avatar.png", caption: null }]);
  });

  it("captures a caption from a sibling field on an image record", () => {
    expect(
      collectToolImages({
        url: "https://x.com/profile.jpg",
        caption: "Profile photo from x.com",
      })
    ).toEqual([
      { url: "https://x.com/profile.jpg", caption: "Profile photo from x.com" },
    ]);
  });

  it("accepts data URIs and image arrays, ignores non-image links", () => {
    expect(
      collectToolImages({
        link: "https://example.com/page",
        images: ["data:image/png;base64,AAAA", "https://a.com/b.webp"],
      })
    ).toEqual([
      { url: "data:image/png;base64,AAAA", caption: null },
      { url: "https://a.com/b.webp", caption: null },
    ]);
  });

  it("returns nothing when no image-like values are present", () => {
    expect(collectToolImages({ title: "no images", count: 3 })).toEqual([]);
  });
});

describe("unwrapEngentyToolExecuteOutput", () => {
  it("unwraps successful execution payloads", () => {
    expect(
      unwrapEngentyToolExecuteOutput("engenty_tool_execute", {
        ok: true,
        data: { error: "No knowledge base found" },
      })
    ).toEqual({ error: "No knowledge base found" });
  });

  it("strips legacy catalog metadata from persisted outputs", () => {
    expect(
      unwrapEngentyToolExecuteOutput("engenty_tool_execute", {
        ok: true,
        data: { items: [] },
        tool: {
          id: "kb_search",
          description: "Search Knowledge Base content",
          inputSchema: { type: "object" },
        },
      })
    ).toEqual({ items: [] });
  });

  it("leaves other tool outputs unchanged", () => {
    const output = { ok: true, matches: [] };
    expect(unwrapEngentyToolExecuteOutput("engenty_tools_search", output)).toBe(
      output
    );
  });
});

describe("summarizeToolStepBrief", () => {
  it("summarizes list counts with the scope noun", () => {
    expect(
      summarizeToolStepBrief({
        toolName: "inbox_list_accounts",
        metadata: "accounts",
        output: { ok: true, data: { total: 3, results: [{}, {}, {}] } },
      })
    ).toBe("3 accounts");
  });

  it("summarizes update mutations without dumping UUIDs", () => {
    expect(
      summarizeToolStepBrief({
        toolName: "inbox_update_settings",
        metadata: "settings",
        input: {
          id: "inbox_update_settings",
          input: {
            account_id: "6d83c905-d554-4952-8fdf-22f46709aaaa",
            backfill_days: 60,
          },
        },
        output: { ok: true, data: { backfill_days: 60 } },
      })
    ).toBe("backfill_days: 60");
  });

  it("surfaces a created entity name", () => {
    expect(
      summarizeToolStepBrief({
        toolName: "contacts_create",
        metadata: "contacts",
        input: { name: "Ada Lovelace" },
        output: { ok: true, data: { id: "c-1", name: "Ada Lovelace" } },
      })
    ).toBe("Ada Lovelace");
  });
});
