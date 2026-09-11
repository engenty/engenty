import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchMarkdownFromResultContentMetadata,
  markdownFromLlamaCloudParsingResult,
} from "./llama-cloud-markdown.js";

describe("markdownFromLlamaCloudParsingResult", () => {
  it("prefers markdown_full when per-page markdown is absent", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        markdown_full: "  # Hi  ",
        text_full: "plain",
      })
    ).toBe("# Hi");
  });

  it("uses text_full when markdown is empty", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        text_full: "plain text",
      })
    ).toBe("plain text");
  });

  it("joins markdown.pages with page-break sentinels even when markdown_full exists", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        markdown_full: "ignored",
        markdown: {
          pages: [
            { success: true, page_number: 1, markdown: "A" },
            { success: true, page_number: 2, markdown: "B" },
          ],
        },
      })
    ).toBe(
      [
        '<page-break number="1" total="2"></page-break>',
        "",
        "A",
        "",
        '<page-break number="2" total="2"></page-break>',
        "",
        "B",
      ].join("\n")
    );
  });

  it("concatenates markdown.pages when full fields are absent", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        markdown: {
          pages: [
            { success: true, page_number: 1, markdown: "A" },
            { success: true, page_number: 2, markdown: "B" },
          ],
        },
      })
    ).toBe(
      [
        '<page-break number="1" total="2"></page-break>',
        "",
        "A",
        "",
        '<page-break number="2" total="2"></page-break>',
        "",
        "B",
      ].join("\n")
    );
  });

  it("uses markdown string on pages even when success is missing", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        markdown: {
          pages: [{ page_number: 1, markdown: "  loose  " }],
        },
      })
    ).toBe('<page-break number="1" total="1"></page-break>\n\nloose');
  });

  it("builds markdown from structured items when pages lack full markdown", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        items: {
          pages: [
            {
              success: true,
              page_number: 1,
              page_height: 100,
              page_width: 100,
              items: [
                { type: "text", md: "# Title", value: "Title" },
                {
                  type: "list",
                  md: "- a",
                  ordered: false,
                  items: [{ type: "text", md: "nested", value: "nested" }],
                },
              ],
            },
          ],
        },
      })
    ).toBe(
      [
        '<page-break number="1" total="1"></page-break>',
        "",
        "# Title",
        "",
        "- a",
        "",
        "nested",
      ].join("\n")
    );
  });

  it("falls back to legacy markdown_content", () => {
    expect(
      markdownFromLlamaCloudParsingResult({
        markdown_content: "legacy",
      })
    ).toBe("legacy");
  });

  it("returns empty for null or non-object", () => {
    expect(markdownFromLlamaCloudParsingResult(null)).toBe("");
    expect(markdownFromLlamaCloudParsingResult("x")).toBe("");
  });
});

describe("fetchMarkdownFromResultContentMetadata", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches presigned markdown in key preference order", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example/md") {
        return { ok: true, text: async () => "from md url" };
      }
      if (url === "https://example/txt") {
        return { ok: true, text: async () => "from text url" };
      }
      return { ok: false, text: async () => "" };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const body = await fetchMarkdownFromResultContentMetadata({
      result_content_metadata: {
        other: { presigned_url: "https://example/txt" },
        doc_markdown: { presigned_url: "https://example/md" },
      },
    });

    expect(body).toBe("from md url");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
