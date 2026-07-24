import { describe, expect, it } from "vitest";
import { ROUTINE_ENTITY_TYPE, routineEntityRef } from "./routine-ref.js";

describe("routineEntityRef", () => {
  it("stamps the tasks.routine entity scope", () => {
    expect(routineEntityRef("trig-1")).toBe(`${ROUTINE_ENTITY_TYPE}:trig-1`);
  });
});
