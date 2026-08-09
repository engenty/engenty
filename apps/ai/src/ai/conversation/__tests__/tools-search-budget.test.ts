import { describe, expect, it } from "vitest";
import { fitMatchesToBudget } from "../../../../ai/tools/engenty-tools/engenty-tools-search-tool.js";

function bigSchema(propertyCount: number) {
  const properties: Record<string, unknown> = {};
  for (let i = 0; i < propertyCount; i += 1) {
    properties[`field_${i}`] = {
      // Long patterns like the uuid one are a big part of the real payload.
      pattern:
        "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$",
      type: "string",
    };
  }
  return { properties, required: ["field_0"], type: "object" };
}

function match(name: string, propertyCount: number) {
  return {
    description: `does ${name}`,
    inputSchema: bigSchema(propertyCount),
    name,
  };
}

describe("engenty_tools_search stays within a byte budget", () => {
  it("keeps every match, compacting the overflow instead of dropping it", () => {
    // A dozen contracts like this is what produced a 20 KB single result.
    const matches = Array.from({ length: 12 }, (_, i) =>
      match(`tool_${i}`, 12)
    );

    const fitted = fitMatchesToBudget(matches, 4000);

    expect(fitted.matches).toHaveLength(12);
    expect(fitted.compacted).toBeGreaterThan(0);
    expect(JSON.stringify(fitted.matches).length).toBeLessThan(8000);
  });

  it("names every tool even when compacted — discovery must stay usable", () => {
    const matches = Array.from({ length: 12 }, (_, i) =>
      match(`tool_${i}`, 12)
    );
    const fitted = fitMatchesToBudget(matches, 1000);

    expect(fitted.matches.map((m) => m.name)).toEqual(
      matches.map((m) => m.name)
    );
    // A compacted match still says HOW to call it: parameter names + required.
    const last = fitted.matches.at(-1)?.inputSchema as {
      properties?: string[];
      required?: string[];
      schema_omitted?: string;
    };
    expect(last.properties).toContain("field_0");
    expect(last.required).toEqual(["field_0"]);
    expect(last.schema_omitted).toBeTruthy();
  });

  it("leaves a small result untouched", () => {
    const matches = [match("only_tool", 2)];
    const fitted = fitMatchesToBudget(matches, 4000);

    expect(fitted.compacted).toBe(0);
    expect(fitted.matches[0]).toEqual(matches[0]);
  });

  it("tolerates a missing or non-object schema", () => {
    const fitted = fitMatchesToBudget(
      [
        { description: "d", inputSchema: {}, name: "a" },
        { description: "d", inputSchema: undefined as never, name: "b" },
      ],
      1
    );
    expect(fitted.matches).toHaveLength(2);
  });
});
