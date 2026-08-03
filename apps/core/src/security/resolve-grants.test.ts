import { RoleProfileRegistry } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createAssignedRoleIdsCache,
  type GrantSubject,
  resolveGrants,
} from "./resolve-grants.js";
import { registerCoreRoleProfiles } from "./role-profiles.js";

function registry() {
  const r = new RoleProfileRegistry();
  registerCoreRoleProfiles(r);
  return r;
}

const noAssignments = () => Promise.resolve<string[]>([]);

describe("resolveGrants", () => {
  it("superadmin short-circuits to core.superadmin + wildcard", async () => {
    const listAssignedRoleIds = vi.fn(noAssignments);
    const grants = await resolveGrants(
      { registry: registry(), listAssignedRoleIds },
      { kind: "user", id: "u1", isSuperAdmin: true, tenantRole: "admin" },
      "t1"
    );
    expect(grants).toEqual({
      roleProfiles: ["core.superadmin"],
      capabilities: ["core.superadmin", "*"],
    });
    // Never even reads assignments for a superadmin.
    expect(listAssignedRoleIds).not.toHaveBeenCalled();
  });

  it("admin base resolves to today's wildcard bundle", async () => {
    const grants = await resolveGrants(
      { registry: registry(), listAssignedRoleIds: noAssignments },
      { kind: "user", id: "u1", isSuperAdmin: false, tenantRole: "admin" },
      "t1"
    );
    expect(grants.roleProfiles).toEqual(["tenant.admin"]);
    expect(grants.capabilities).toEqual(["core.credentials.manage", "*"]);
  });

  it("member base grants full module access + settings", async () => {
    const grants = await resolveGrants(
      { registry: registry(), listAssignedRoleIds: noAssignments },
      { kind: "user", id: "u1", isSuperAdmin: false, tenantRole: "member" },
      "t1"
    );
    expect(grants.capabilities).toEqual([
      "module.*",
      "tenant-settings.read",
      "tenant-settings.write",
      "user-settings.read",
      "user-settings.write",
    ]);
    // module.* covers any module read/write but NOT core administration.
    expect(grants.capabilities).not.toContain("*");
    expect(grants.capabilities).not.toContain("core.*");
  });

  it("a user with no tenant role gets no grants", async () => {
    const grants = await resolveGrants(
      { registry: registry(), listAssignedRoleIds: noAssignments },
      { kind: "user", id: "u1", isSuperAdmin: false, tenantRole: null },
      "t1"
    );
    expect(grants).toEqual({ roleProfiles: [], capabilities: [] });
  });

  it("agents get the capable read+write assistant base by default", async () => {
    const grants = await resolveGrants(
      { registry: registry(), listAssignedRoleIds: noAssignments },
      { kind: "agent", id: "a1" },
      "t1"
    );
    expect(grants.roleProfiles).toEqual(["agent.assistant"]);
    expect(grants.capabilities).toEqual(["module.read", "module.write"]);
  });

  it("unions assigned roles, dedupes caps, ignores unknown ids", async () => {
    const r = registry();
    r.register("invoices", {
      id: "invoices.clerk",
      title: "clerk",
      capabilities: ["module.invoices.read", "module.invoices.write"],
    });
    const grants = await resolveGrants(
      {
        registry: r,
        listAssignedRoleIds: () =>
          Promise.resolve(["invoices.clerk", "does.not.exist"]),
      },
      { kind: "user", id: "u1", isSuperAdmin: false, tenantRole: "member" },
      "t1"
    );
    expect(grants.roleProfiles).toEqual([
      "tenant.member",
      "invoices.clerk",
      "does.not.exist",
    ]);
    // member caps + clerk caps, no duplicates, unknown id contributes nothing.
    expect(grants.capabilities).toContain("module.invoices.write");
    expect(new Set(grants.capabilities).size).toBe(grants.capabilities.length);
  });

  it("consults getTenantRole for ids not in the code registry", async () => {
    const grants = await resolveGrants(
      {
        registry: registry(),
        listAssignedRoleIds: () => Promise.resolve(["custom.billing"]),
        getTenantRole: (_t, id) =>
          Promise.resolve(
            id === "custom.billing"
              ? { id, title: "Billing", capabilities: ["module.billing.read"] }
              : undefined
          ),
      },
      { kind: "user", id: "u1", isSuperAdmin: false, tenantRole: "member" },
      "t1"
    );
    expect(grants.capabilities).toContain("module.billing.read");
  });
});

describe("createAssignedRoleIdsCache", () => {
  it("caches within the TTL and refetches after it, invalidation clears", async () => {
    let calls = 0;
    let clock = 1000;
    const cache = createAssignedRoleIdsCache(
      () => {
        calls += 1;
        return Promise.resolve([`r${calls}`]);
      },
      { ttlMs: 100, now: () => clock }
    );
    const subject: GrantSubject = {
      kind: "user",
      id: "u1",
      isSuperAdmin: false,
      tenantRole: "member",
    };
    expect(await cache.listAssignedRoleIds("t1", subject)).toEqual(["r1"]);
    expect(await cache.listAssignedRoleIds("t1", subject)).toEqual(["r1"]);
    expect(calls).toBe(1);
    clock += 200; // past TTL
    expect(await cache.listAssignedRoleIds("t1", subject)).toEqual(["r2"]);
    expect(calls).toBe(2);
    cache.invalidate("t1", "u1");
    expect(await cache.listAssignedRoleIds("t1", subject)).toEqual(["r3"]);
    expect(calls).toBe(3);
  });
});
