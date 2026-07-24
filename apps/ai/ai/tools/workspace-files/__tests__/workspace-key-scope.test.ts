import { describe, expect, it } from "vitest";
import { resolveWorkspaceObjectKey } from "../index.js";

const TASK = "tenants/t1/ai/workspace/tasks/ENG-1/";
const ROUTINE = "tenants/t1/ai/workspace/routines/trig-1/";
const GOAL = "tenants/t1/ai/workspace/goals/goal-1/";

describe("resolveWorkspaceObjectKey", () => {
  it("resolves a relative path under the first allowed prefix", () => {
    expect(resolveWorkspaceObjectKey("state.md", [TASK, ROUTINE])).toBe(
      `${TASK}state.md`
    );
  });

  it("allows a full key under an allowed prefix", () => {
    expect(
      resolveWorkspaceObjectKey(`${ROUTINE}state.md`, [TASK, ROUTINE])
    ).toBe(`${ROUTINE}state.md`);
  });

  it("rejects traversal", () => {
    expect(() => resolveWorkspaceObjectKey("../secrets.txt", [TASK])).toThrow(
      "workspace_key_invalid"
    );
  });

  it("rejects foreign prefixes", () => {
    expect(() =>
      resolveWorkspaceObjectKey(
        "tenants/t1/ai/workspace/tasks/ENG-OTHER/x.md",
        [TASK]
      )
    ).toThrow("workspace_key_forbidden");
  });

  it("rejects absolute-looking foreign keys", () => {
    expect(() => resolveWorkspaceObjectKey("/etc/passwd", [TASK])).toThrow(
      "workspace_key_forbidden"
    );
  });

  it("allows a full key under the goal prefix", () => {
    expect(resolveWorkspaceObjectKey(`${GOAL}shared.md`, [TASK, GOAL])).toBe(
      `${GOAL}shared.md`
    );
  });

  it("rejects a foreign goal prefix", () => {
    expect(() =>
      resolveWorkspaceObjectKey(
        "tenants/t1/ai/workspace/goals/goal-OTHER/x.md",
        [TASK, GOAL]
      )
    ).toThrow("workspace_key_forbidden");
  });
});
