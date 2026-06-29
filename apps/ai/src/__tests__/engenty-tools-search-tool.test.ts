import { describe, expect, it } from "vitest";
import { createEngentyToolsSearchTool } from "../../ai/tools/engenty-tools/engenty-tools-search-tool.js";

describe("createEngentyToolsSearchTool", () => {
  it("documents that search is discovery and selected tools must be run next", () => {
    const tool = createEngentyToolsSearchTool();

    expect(tool.description).toContain("API/tool discovery only");
    expect(tool.description).toContain("engenty_tools_modules");
    expect(tool.description).toContain("engenty_tool_execute");
    expect(tool.description).toContain("omit method");
  });
});
