import { describe, expect, it } from "vitest";
import { readSharedValue } from "./use-engenty-agent-state.js";

describe("readSharedValue", () => {
  it("reads shared[key] from agent host state", () => {
    const state = { shared: { plan: { steps: ["a", "b"] }, filter: "open" } };
    expect(readSharedValue(state, "plan")).toEqual({ steps: ["a", "b"] });
    expect(readSharedValue(state, "filter")).toBe("open");
  });

  it("returns undefined for a missing key", () => {
    expect(readSharedValue({ shared: {} }, "plan")).toBeUndefined();
  });

  it("tolerates state without shared, or non-object state", () => {
    expect(readSharedValue({ route: {} }, "plan")).toBeUndefined();
    expect(readSharedValue(undefined, "plan")).toBeUndefined();
    expect(readSharedValue(null, "plan")).toBeUndefined();
    expect(readSharedValue("nope", "plan")).toBeUndefined();
    expect(readSharedValue({ shared: [] }, "plan")).toBeUndefined();
  });
});
