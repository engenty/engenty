import { describe, expect, it } from "vitest";
import {
  ENGENTY_EFFORT_RESOLVED_EVENT,
  readEngentyEffortResolvedEventValue,
} from "../engenty-effort-resolved.js";

describe("readEngentyEffortResolvedEventValue", () => {
  it("parses a valid Auto resolution payload", () => {
    expect(
      readEngentyEffortResolvedEventValue({
        effort: "medium",
        model_id: "openai/gpt-5-mini",
        source: "heuristic",
      })
    ).toEqual({
      effort: "medium",
      model_id: "openai/gpt-5-mini",
      source: "heuristic",
    });
  });

  it("rejects unknown effort values", () => {
    expect(
      readEngentyEffortResolvedEventValue({ effort: "extreme" })
    ).toBeNull();
  });
});

describe("ENGENTY_EFFORT_RESOLVED_EVENT", () => {
  it("keeps the namespaced CUSTOM event id stable", () => {
    expect(ENGENTY_EFFORT_RESOLVED_EVENT).toBe("engenty.effort.resolved");
  });
});
