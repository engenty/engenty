import { describe, expect, it } from "vitest";
import { parsePlanText } from "../src/api/nl-query.js";

describe("parsePlanText", () => {
  it("parses a bare plan and fills defaults", () => {
    expect(
      parsePlanText(
        '{"understood": true, "mode": "traverse", "anchors": [{"name": "Gruber"}], "edgeType": "team.reports_to", "direction": "in"}'
      )
    ).toEqual({
      anchors: [{ name: "Gruber" }],
      depth: 1,
      direction: "in",
      edgeType: "team.reports_to",
      limit: 5,
      mode: "traverse",
      understood: true,
    });
  });

  it("ignores code fences and words around the object", () => {
    const plan = parsePlanText(
      'Here is the plan:\n```json\n{"mode": "rank", "edgeType": "team.reports_to", "direction": "in", "limit": 1, "anchors": []}\n```'
    );
    expect(plan.mode).toBe("rank");
    expect(plan.limit).toBe(1);
  });

  it("throws when there is no JSON object or it breaks the schema", () => {
    expect(() => parsePlanText("I cannot answer that.")).toThrow();
    expect(() => parsePlanText('{"mode": "teleport"}')).toThrow();
  });
});
