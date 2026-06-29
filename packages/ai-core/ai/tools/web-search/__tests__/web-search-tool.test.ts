import { describe, expect, it, vi } from "vitest";
import {
  buildMastraWebSearchTool,
  runWebSearch,
  WEB_SEARCH_TOOL_ID,
} from "../web-search-tool.js";

describe("web search tool", () => {
  it("builds a Mastra-compatible web_search tool", async () => {
    const createTool = vi.fn((definition) => definition);

    const tool = buildMastraWebSearchTool(createTool, {
      search: async (input) => ({
        ok: true,
        query: input.query,
        sources: [{ type: "url", url: "https://example.com/imprint" }],
        text: "Example GmbH imprint evidence.",
      }),
    });

    expect(createTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: WEB_SEARCH_TOOL_ID,
      })
    );

    await expect(
      tool.execute({
        query: "Example GmbH imprint",
        searchContextSize: "high",
      })
    ).resolves.toEqual({
      ok: true,
      query: "Example GmbH imprint",
      sources: [{ type: "url", url: "https://example.com/imprint" }],
      text: "Example GmbH imprint evidence.",
    });
  });

  it("validates input before invoking the search runner", async () => {
    const search = vi.fn();

    await expect(runWebSearch({ query: "" }, { search })).rejects.toThrow();

    expect(search).not.toHaveBeenCalled();
  });
});
