import { describe, expect, it } from "vitest";
import { buildEffectiveToolRows } from "./agent-effective-tools";
import { humanizeToolId } from "./tool-admin-descriptions";

describe("buildEffectiveToolRows", () => {
  it("dedupes tools and merges contributing skills", () => {
    const rows = buildEffectiveToolRows([
      { allowed_tools: ["a", "b"], name: "s1" },
      { allowed_tools: ["b", "c"], name: "s2" },
    ]);
    expect(rows).toEqual([
      {
        description: humanizeToolId("a"),
        skillNames: ["s1"],
        tool: "a",
      },
      {
        description: humanizeToolId("b"),
        skillNames: ["s1", "s2"],
        tool: "b",
      },
      {
        description: humanizeToolId("c"),
        skillNames: ["s2"],
        tool: "c",
      },
    ]);
  });

  it("returns empty for no tools", () => {
    expect(buildEffectiveToolRows([{ allowed_tools: [], name: "x" }])).toEqual(
      []
    );
  });

  it("merges agent runtime tool ids not present on any skill", () => {
    const rows = buildEffectiveToolRows(
      [{ allowed_tools: ["a"], name: "s1" }],
      ["a", "create-article", "update-article"]
    );
    expect(rows.map((r) => r.tool)).toEqual([
      "a",
      "create-article",
      "update-article",
    ]);
    expect(rows.find((r) => r.tool === "a")?.skillNames).toEqual(["s1"]);
    expect(rows.find((r) => r.tool === "update-article")?.skillNames).toEqual(
      []
    );
  });
});
