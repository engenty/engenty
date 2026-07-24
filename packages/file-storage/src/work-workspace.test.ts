import { describe, expect, it } from "vitest";
import {
  COMMONS_STORAGE_PREFIX,
  parseWorkWorkspacePrefix,
  workWorkspacePrefix,
  workWorkspaceRelativePrefix,
} from "./work-workspace.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const TRIGGER = "22222222-2222-4222-8222-222222222222";
const GOAL = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";

describe("workWorkspacePrefix", () => {
  it("builds every tier with a trailing slash", () => {
    expect(workWorkspacePrefix(TENANT, "task", "ENG-1")).toBe(
      `tenants/${TENANT}/ai/workspace/tasks/ENG-1/`
    );
    expect(workWorkspacePrefix(TENANT, "routine", TRIGGER)).toBe(
      `tenants/${TENANT}/ai/workspace/routines/${TRIGGER}/`
    );
    expect(workWorkspacePrefix(TENANT, "goal", GOAL)).toBe(
      `tenants/${TENANT}/ai/workspace/goals/${GOAL}/`
    );
    expect(workWorkspacePrefix(TENANT, "project", PROJECT)).toBe(
      `tenants/${TENANT}/ai/workspace/projects/${PROJECT}/`
    );
    expect(workWorkspacePrefix(TENANT, "global")).toBe(
      `tenants/${TENANT}/ai/workspace/commons/`
    );
  });

  it("accepts non-uuid ids (task identifiers)", () => {
    expect(workWorkspacePrefix(TENANT, "task", "ENG-142")).toContain(
      "/tasks/ENG-142/"
    );
  });

  it("rejects missing or traversal ids", () => {
    expect(() => workWorkspacePrefix(TENANT, "task")).toThrow(
      "task_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, "task", "")).toThrow(
      "task_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, "goal", "../x")).toThrow(
      "goal_id_invalid"
    );
    expect(() => workWorkspacePrefix(TENANT, "routine", "a/b")).toThrow(
      "routine_id_invalid"
    );
    expect(() => workWorkspacePrefix("", "global")).toThrow(
      "tenant_id_required"
    );
  });

  it("ignores id for global", () => {
    expect(workWorkspacePrefix(TENANT, "global", "ignored")).toBe(
      `tenants/${TENANT}/ai/workspace/commons/`
    );
  });
});

describe("workWorkspaceRelativePrefix", () => {
  it("matches shipped commons and task relative literals", () => {
    expect(COMMONS_STORAGE_PREFIX).toBe("ai/workspace/commons/");
    expect(workWorkspaceRelativePrefix("global")).toBe(COMMONS_STORAGE_PREFIX);
    expect(workWorkspaceRelativePrefix("task", "ENG-142")).toBe(
      "ai/workspace/tasks/ENG-142/"
    );
    expect(workWorkspaceRelativePrefix("routine", TRIGGER)).toBe(
      `ai/workspace/routines/${TRIGGER}/`
    );
  });
});

describe("parseWorkWorkspacePrefix", () => {
  it("round-trips full and relative prefixes", () => {
    const taskFull = workWorkspacePrefix(TENANT, "task", "ENG-1");
    expect(parseWorkWorkspacePrefix(taskFull)).toEqual({
      tier: "task",
      id: "ENG-1",
    });
    expect(parseWorkWorkspacePrefix(`${taskFull}notes.md`)).toEqual({
      tier: "task",
      id: "ENG-1",
    });
    expect(
      parseWorkWorkspacePrefix(workWorkspaceRelativePrefix("routine", TRIGGER))
    ).toEqual({ tier: "routine", id: TRIGGER });
    expect(parseWorkWorkspacePrefix(COMMONS_STORAGE_PREFIX)).toEqual({
      tier: "global",
      id: null,
    });
    expect(
      parseWorkWorkspacePrefix(workWorkspacePrefix(TENANT, "global"))
    ).toEqual({ tier: "global", id: null });
  });

  it("returns null for unrelated paths", () => {
    expect(parseWorkWorkspacePrefix("inbox/x")).toBeNull();
    expect(
      parseWorkWorkspacePrefix(`tenants/${TENANT}/ai/workspace/agents/x/`)
    ).toBeNull();
  });
});
