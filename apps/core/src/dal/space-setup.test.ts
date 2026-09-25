import { describe, expect, it } from "vitest";
import type { SpaceMount } from "./space-mounts.js";
import {
  mergeDesiredMounts,
  normalizeDesiredMount,
  planSpaceSetup,
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
  it("defaults a module to granting NOTHING", () => {
    // Mounting must never be an implicit grant: a payload that leaves
    // agent_access out gets `none`, not `read`.
    expect(
      normalizeDesiredMount({ resourceKey: "secrets", resourceType: "module" })
        .agentAccess
    ).toBe("none");
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
});

describe("mergeDesiredMounts", () => {
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
});
