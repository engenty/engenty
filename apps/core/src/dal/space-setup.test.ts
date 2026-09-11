import { describe, expect, it } from "vitest";
import type { SpaceMount } from "./space-mounts.js";
import {
  assertSpaceSetupDependencies,
  mergeDesiredMounts,
  normalizeDesiredMount,
  planSpaceSetup,
  SpaceSetupError,
} from "./space-setup.js";

const SPACE = "99999999-9999-4999-8999-999999999999";
const TENANT = "11111111-1111-4111-8111-111111111111";

function existing(
  partial: Partial<SpaceMount> &
    Pick<SpaceMount, "resourceType" | "resourceKey">
): SpaceMount {
  return {
    agentAccess: null,
    createdAt: "2026-08-10T00:00:00Z",
    isRequired: false,
    recordScope: null,
    reportsTo: null,
    spaceId: SPACE,
    tenantId: TENANT,
    ...partial,
  };
}

const keysOf = (mounts: { resourceKey: string; resourceType: string }[]) =>
  mounts.map((mount) => `${mount.resourceType}:${mount.resourceKey}`).sort();

describe("normalizeDesiredMount", () => {
  it("settles a module mount's columns the way the CHECK demands", () => {
    expect(
      normalizeDesiredMount({ resourceKey: "offers", resourceType: "module" })
    ).toEqual({
      agentAccess: "none",
      // Not `"space"`. The column is undecided until something reads it, and a
      // default here is how every mount ended up claiming a scope nobody chose.
      recordScope: null,
      resourceKey: "offers",
      resourceType: "module",
    });
  });

  it("defaults a module to granting NOTHING", () => {
    // Mounting must never be an implicit grant: a payload that leaves
    // agent_access out gets `none`, not `read`.
    expect(
      normalizeDesiredMount({ resourceKey: "secrets", resourceType: "module" })
        .agentAccess
    ).toBe("none");
  });

  it("keeps a connection mount's level, and leaves an omitted one undecided", () => {
    // PLAN-connections-ux.md B1: the level is the per-space half of "may this
    // space's engentys use this account". NULL is not `none` — it means the
    // space never said, and the account's own autonomous_mode decides alone.
    expect(
      normalizeDesiredMount({
        agentAccess: "read",
        resourceKey: "c0ffee00-0000-4000-8000-000000000000",
        resourceType: "connection",
      })
    ).toEqual({
      agentAccess: "read",
      recordScope: null,
      resourceKey: "c0ffee00-0000-4000-8000-000000000000",
      resourceType: "connection",
    });
    expect(
      normalizeDesiredMount({
        recordScope: "all",
        resourceKey: "c0ffee00-0000-4000-8000-000000000000",
        resourceType: "connection",
      })
    ).toEqual({
      agentAccess: null,
      // Still module-only, level or not.
      recordScope: null,
      resourceKey: "c0ffee00-0000-4000-8000-000000000000",
      resourceType: "connection",
    });
  });

  it("strips module-only columns off an agent or skill mount", () => {
    // `space_mount_access_config_check` rejects them, and a stray agent_access
    // on an agent row would sit there looking authoritative while no reader
    // honours it — what a mounted agent may reach is the space's OTHER mounts.
    expect(
      normalizeDesiredMount({
        agentAccess: "write",
        recordScope: "all",
        resourceKey: "custom.researcher",
        resourceType: "agent",
      })
    ).toEqual({
      agentAccess: null,
      recordScope: null,
      resourceKey: "custom.researcher",
      resourceType: "agent",
    });
  });
});

describe("planSpaceSetup", () => {
  it("adds what is new, removes what is gone, leaves the rest alone", () => {
    const plan = planSpaceSetup({
      desired: [
        { agentAccess: "write", resourceKey: "offers", resourceType: "module" },
        { resourceKey: "custom.researcher", resourceType: "agent" },
      ],
      existing: [
        existing({
          agentAccess: "write",
          resourceKey: "offers",
          resourceType: "module",
        }),
        existing({
          agentAccess: "write",
          resourceKey: "invoices",
          resourceType: "module",
        }),
      ],
    });
    expect(keysOf(plan.upsert)).toEqual(["agent:custom.researcher"]);
    expect(keysOf(plan.remove)).toEqual(["module:invoices"]);
    expect(keysOf(plan.unchanged)).toEqual(["module:offers"]);
  });

  it("rewrites a mount whose access level changed", () => {
    // The case that makes this a diff rather than an insert-if-absent: the row
    // exists, so a naive planner would call it unchanged and the space's
    // engentys would keep the write grant the admin just revoked.
    const plan = planSpaceSetup({
      desired: [
        { agentAccess: "read", resourceKey: "offers", resourceType: "module" },
      ],
      existing: [
        existing({
          agentAccess: "write",
          resourceKey: "offers",
          resourceType: "module",
        }),
      ],
    });
    expect(keysOf(plan.upsert)).toEqual(["module:offers"]);
    expect(plan.upsert[0]?.agentAccess).toBe("read");
    expect(plan.unchanged).toEqual([]);
  });

  it("rewrites a mount whose record scope changed", () => {
    const plan = planSpaceSetup({
      desired: [
        {
          agentAccess: "write",
          recordScope: "all",
          resourceKey: "contacts",
          resourceType: "module",
        },
      ],
      existing: [
        existing({
          agentAccess: "write",
          resourceKey: "contacts",
          resourceType: "module",
        }),
      ],
    });
    expect(keysOf(plan.upsert)).toEqual(["module:contacts"]);
  });

  it("refuses to plan the removal of a required mount", () => {
    const plan = planSpaceSetup({
      desired: [],
      existing: [
        existing({
          isRequired: true,
          resourceKey: "engenty.copilot",
          resourceType: "agent",
        }),
        existing({ resourceKey: "slack", resourceType: "connection" }),
      ],
    });
    expect(keysOf(plan.protectedRemovals)).toEqual(["agent:engenty.copilot"]);
    expect(keysOf(plan.remove)).toEqual(["connection:slack"]);
  });

  it("treats kind as part of a mount's identity", () => {
    // `agent:engenty.copilot` and `skill:engenty.copilot` are different rows;
    // planning on the key alone would delete one to satisfy the other.
    const plan = planSpaceSetup({
      desired: [{ resourceKey: "research", resourceType: "skill" }],
      existing: [existing({ resourceKey: "research", resourceType: "agent" })],
    });
    expect(keysOf(plan.upsert)).toEqual(["skill:research"]);
    expect(keysOf(plan.remove)).toEqual(["agent:research"]);
  });

  it("drops a blank resource key instead of writing an empty grant", () => {
    const plan = planSpaceSetup({
      desired: [
        { agentAccess: "write", resourceKey: "  ", resourceType: "module" },
      ],
      existing: [],
    });
    expect(plan.upsert).toEqual([]);
  });

  it("plans nothing when the desired set already matches", () => {
    const rows = [
      existing({
        agentAccess: "none",
        recordScope: "space",
        isRequired: true,
        resourceKey: "engenty-copilot",
        resourceType: "module",
      }),
      existing({
        isRequired: true,
        resourceKey: "engenty.copilot",
        resourceType: "agent",
      }),
    ];
    const plan = planSpaceSetup({
      desired: rows.map((row) => ({
        agentAccess: row.agentAccess,
        recordScope: row.recordScope,
        resourceKey: row.resourceKey,
        resourceType: row.resourceType,
      })),
      existing: rows,
    });
    expect(plan.upsert).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.protectedRemovals).toEqual([]);
    expect(plan.unchanged).toHaveLength(2);
  });
});

describe("mergeDesiredMounts", () => {
  it("re-adding a module without a level keeps the level it has", () => {
    // How a mount is re-added to retry its module's setup: the access the
    // space gave it must survive the retry.
    const merged = mergeDesiredMounts({
      added: [{ resourceKey: "knowledge-base", resourceType: "module" }],
      existing: [
        existing({
          agentAccess: "write",
          recordScope: "space",
          resourceKey: "knowledge-base",
          resourceType: "module",
        }),
      ],
    });
    expect(merged).toEqual([
      {
        agentAccess: "write",
        recordScope: "space",
        resourceKey: "knowledge-base",
        resourceType: "module",
      },
    ]);
  });

  it("an explicit level wins over the existing one", () => {
    const merged = mergeDesiredMounts({
      added: [
        {
          agentAccess: "read",
          resourceKey: "knowledge-base",
          resourceType: "module",
        },
      ],
      existing: [
        existing({
          agentAccess: "write",
          resourceKey: "knowledge-base",
          resourceType: "module",
        }),
      ],
    });
    expect(merged[0]?.agentAccess).toBe("read");
  });

  it("a fresh module mount without a level is closed to engentys", () => {
    const merged = mergeDesiredMounts({
      added: [{ resourceKey: "tasks", resourceType: "module" }],
      existing: [],
    });
    expect(merged[0]?.agentAccess).toBe("none");
  });
});

describe("assertSpaceSetupDependencies", () => {
  const requires = new Map([["projects", ["tasks"]]]);

  it("refuses projects without tasks and names the pair", () => {
    expect(() =>
      assertSpaceSetupDependencies(
        [{ resourceKey: "projects", resourceType: "module" }],
        requires
      )
    ).toThrow(SpaceSetupError);
    try {
      assertSpaceSetupDependencies(
        [{ resourceKey: "projects", resourceType: "module" }],
        requires
      );
    } catch (error) {
      expect((error as SpaceSetupError).name).toBe(
        "space_setup_missing_dependency"
      );
      expect((error as SpaceSetupError).message).toContain(
        "projects requires tasks"
      );
      expect(keysOf([...(error as SpaceSetupError).mounts])).toEqual([
        "module:tasks",
      ]);
    }
  });

  it("accepts a closed set, and a set with no dependent modules", () => {
    expect(() =>
      assertSpaceSetupDependencies(
        [
          { resourceKey: "projects", resourceType: "module" },
          { resourceKey: " tasks ", resourceType: "module" },
        ],
        requires
      )
    ).not.toThrow();
    expect(() =>
      assertSpaceSetupDependencies(
        [{ resourceKey: "tasks", resourceType: "module" }],
        requires
      )
    ).not.toThrow();
  });
});
