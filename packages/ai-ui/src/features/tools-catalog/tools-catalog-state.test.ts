import { describe, expect, it } from "vitest";
import {
  deriveToolSource,
  deriveToolSourceCategory,
  filterTools,
  type RegistryToolEntry,
} from "./tools-catalog-state";

function tool(partial: Partial<RegistryToolEntry>): RegistryToolEntry {
  return {
    description: undefined,
    id: "test.tool",
    name: "Test Tool",
    ...partial,
  };
}

const moduleTool = tool({ id: "contacts.search", source: "contacts" });
const mcpTool = tool({ id: "mcp.search", engenty_mcp_app: "my-mcp-app" });
const customTool = tool({
  id: "my-custom",
  name: "My Custom",
  source: undefined,
});
const customToolExplicit = tool({ id: "other", source: "custom" });

describe("deriveToolSource", () => {
  it("returns module:<id> for module tools", () => {
    expect(deriveToolSource(moduleTool)).toBe("module:contacts");
  });
  it("returns mcp:<app> when engenty_mcp_app is set", () => {
    expect(deriveToolSource(mcpTool)).toBe("mcp:my-mcp-app");
  });
  it("returns custom when no source or source=custom", () => {
    expect(deriveToolSource(customTool)).toBe("custom");
    expect(deriveToolSource(customToolExplicit)).toBe("custom");
  });
});

describe("deriveToolSourceCategory", () => {
  it("categorises correctly", () => {
    expect(deriveToolSourceCategory(moduleTool)).toBe("module");
    expect(deriveToolSourceCategory(mcpTool)).toBe("mcp");
    expect(deriveToolSourceCategory(customTool)).toBe("custom");
  });
});

describe("filterTools", () => {
  const all = [moduleTool, mcpTool, customTool];

  it("returns all tools with no filter", () => {
    expect(filterTools(all, { searchQuery: "", sourceFilter: "all" })).toEqual(
      all
    );
  });

  it("filters by source category", () => {
    expect(
      filterTools(all, { searchQuery: "", sourceFilter: "module" })
    ).toEqual([moduleTool]);
    expect(filterTools(all, { searchQuery: "", sourceFilter: "mcp" })).toEqual([
      mcpTool,
    ]);
    expect(
      filterTools(all, { searchQuery: "", sourceFilter: "custom" })
    ).toEqual([customTool]);
  });

  it("searches by id, name, description", () => {
    expect(
      filterTools(all, { searchQuery: "custom", sourceFilter: "all" })
    ).toEqual([customTool]);
    expect(
      filterTools(all, { searchQuery: "contacts", sourceFilter: "all" })
    ).toEqual([moduleTool]);
  });

  it("treats coding as a match for tools that talk about code", () => {
    const sandbox = tool({
      description: "Run Python or shell scripts in a sandbox",
      id: "sandbox-code-execution",
      name: "sandbox-code-execution",
    });
    expect(
      filterTools([moduleTool, sandbox], {
        searchQuery: "coding",
        sourceFilter: "all",
      })
    ).toEqual([sandbox]);
  });
});
