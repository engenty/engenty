import { describe, expect, it } from "vitest";
import {
  COMMONS_STORAGE_PREFIX,
  parseWorkWorkspacePrefix,
  workWorkspacePrefix,
  workWorkspaceRelativePrefix,
} from "./work-workspace.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "55555555-5555-4555-8555-555555555555";
const OTHER_SPACE = "66666666-6666-4666-8666-666666666666";
const TRIGGER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "44444444-4444-4444-8444-444444444444";

describe("workWorkspacePrefix", () => {
  it("roots every work tier in the space", () => {
    expect(workWorkspacePrefix(TENANT, SPACE, "task", "ENG-1")).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/tasks/ENG-1/`
    );
    expect(workWorkspacePrefix(TENANT, SPACE, "routine", TRIGGER)).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/routines/${TRIGGER}/`
    );
    expect(workWorkspacePrefix(TENANT, SPACE, "project", PROJECT)).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/projects/${PROJECT}/`
    );
  });

  it("keeps commons at both roots — space's own vs the tenant's", () => {
    expect(workWorkspacePrefix(TENANT, SPACE, "space")).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`
    );
    expect(workWorkspacePrefix(TENANT, null, "global")).toBe(
      `tenants/${TENANT}/ai/workspace/commons/`
    );
  });

  it("is the containment boundary: two spaces share no prefix", () => {
    const a = workWorkspacePrefix(TENANT, SPACE, "task", "ENG-1");
    const b = workWorkspacePrefix(TENANT, OTHER_SPACE, "task", "ENG-1");
    expect(a).not.toBe(b);
    expect(
      a.startsWith(workWorkspacePrefix(TENANT, OTHER_SPACE, "space"))
    ).toBe(false);
    expect(b.startsWith(workWorkspacePrefix(TENANT, SPACE, "space"))).toBe(
      false
    );
  });

  it("nests the space above the module folder, exactly one level", () => {
    const prefix = workWorkspacePrefix(TENANT, SPACE, "task", "ENG-1");
    expect(prefix.split("/").slice(0, 4)).toEqual([
      "tenants",
      TENANT,
      "spaces",
      SPACE,
    ]);
    expect(prefix.split("/").filter((s) => s === "spaces")).toHaveLength(1);
  });

  it("accepts non-uuid ids (task identifiers)", () => {
    expect(workWorkspacePrefix(TENANT, SPACE, "task", "ENG-142")).toContain(
      "/tasks/ENG-142/"
    );
  });

  it("rejects missing or traversal ids", () => {
    expect(() => workWorkspacePrefix(TENANT, SPACE, "task")).toThrow(
      "task_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, SPACE, "task", "")).toThrow(
      "task_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, SPACE, "project", "../x")).toThrow(
      "project_id_invalid"
    );
    expect(() => workWorkspacePrefix(TENANT, SPACE, "routine", "a/b")).toThrow(
      "routine_id_invalid"
    );
    expect(() => workWorkspacePrefix("", null, "global")).toThrow(
      "tenant_id_required"
    );
  });

  it("enforces spaceId === null ⟺ tier === global, in both directions", () => {
    expect(() => workWorkspacePrefix(TENANT, null, "task", "ENG-1")).toThrow(
      "space_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, "", "task", "ENG-1")).toThrow(
      "space_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, "  ", "space")).toThrow(
      "space_id_required"
    );
    expect(() => workWorkspacePrefix(TENANT, SPACE, "global")).toThrow(
      "space_id_forbidden_for_global"
    );
  });

  it("rejects a traversal space id — the boundary must not be escapable", () => {
    expect(() =>
      workWorkspacePrefix(TENANT, "../other", "task", "ENG-1")
    ).toThrow("space_id_invalid");
    expect(() => workWorkspacePrefix(TENANT, "a/b", "task", "ENG-1")).toThrow(
      "space_id_invalid"
    );
  });

  it("ignores id for the space's own commons", () => {
    expect(workWorkspacePrefix(TENANT, SPACE, "space", "ignored")).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/commons/`
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

  it("is unchanged by the space tier — the space moves the root, not the layout", () => {
    expect(workWorkspaceRelativePrefix("space")).toBe(COMMONS_STORAGE_PREFIX);
    expect(workWorkspacePrefix(TENANT, SPACE, "task", "ENG-1")).toBe(
      `tenants/${TENANT}/spaces/${SPACE}/${workWorkspaceRelativePrefix("task", "ENG-1")}`
    );
  });
});

describe("parseWorkWorkspacePrefix", () => {
  it("round-trips space-rooted prefixes and reports the space", () => {
    const taskFull = workWorkspacePrefix(TENANT, SPACE, "task", "ENG-1");
    expect(parseWorkWorkspacePrefix(taskFull)).toEqual({
      id: "ENG-1",
      spaceId: SPACE,
      tier: "task",
    });
    expect(parseWorkWorkspacePrefix(`${taskFull}notes.md`)).toEqual({
      id: "ENG-1",
      spaceId: SPACE,
      tier: "task",
    });
    expect(
      parseWorkWorkspacePrefix(workWorkspacePrefix(TENANT, SPACE, "space"))
    ).toEqual({ id: null, spaceId: SPACE, tier: "space" });
  });

  it("round-trips tenant-level and relative prefixes", () => {
    expect(
      parseWorkWorkspacePrefix(workWorkspaceRelativePrefix("routine", TRIGGER))
    ).toEqual({ id: TRIGGER, spaceId: null, tier: "routine" });
    expect(parseWorkWorkspacePrefix(COMMONS_STORAGE_PREFIX)).toEqual({
      id: null,
      spaceId: null,
      tier: "global",
    });
    expect(
      parseWorkWorkspacePrefix(workWorkspacePrefix(TENANT, null, "global"))
    ).toEqual({ id: null, spaceId: null, tier: "global" });
  });

  it("distinguishes a space's commons from the tenant commons", () => {
    const spaceCommons = workWorkspacePrefix(TENANT, SPACE, "space");
    const tenantCommons = workWorkspacePrefix(TENANT, null, "global");
    expect(parseWorkWorkspacePrefix(spaceCommons)?.tier).toBe("space");
    expect(parseWorkWorkspacePrefix(tenantCommons)?.tier).toBe("global");
  });

  it("returns null for unrelated paths", () => {
    expect(parseWorkWorkspacePrefix("inbox/x")).toBeNull();
    // `goals` is no longer a tier — a stale key parses to nothing rather than
    // resolving to a container the hierarchy no longer has.
    expect(
      parseWorkWorkspacePrefix(
        `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/goals/x/`
      )
    ).toBeNull();
    expect(
      parseWorkWorkspacePrefix(`tenants/${TENANT}/ai/workspace/agents/x/`)
    ).toBeNull();
    expect(
      parseWorkWorkspacePrefix(
        `tenants/${TENANT}/spaces/${SPACE}/ai/workspace/agents/x/`
      )
    ).toBeNull();
  });
});
