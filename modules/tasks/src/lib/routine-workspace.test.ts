import { describe, expect, it } from "vitest";
import {
  routineWorkspaceStoragePrefix,
  triggerIdFromRoutineStoragePrefix,
} from "./routine-workspace.js";

describe("routineWorkspaceStoragePrefix", () => {
  it("builds the routines sibling of the task workspace", () => {
    expect(
      routineWorkspaceStoragePrefix(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      )
    ).toBe(
      "tenants/11111111-1111-4111-8111-111111111111/ai/workspace/routines/22222222-2222-4222-8222-222222222222/"
    );
  });

  it("parses the trigger id back out", () => {
    expect(
      triggerIdFromRoutineStoragePrefix(
        "tenants/t/ai/workspace/routines/trig-9/state.md"
      )
    ).toBe("trig-9");
  });
});
