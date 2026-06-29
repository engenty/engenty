import { describe, expect, it } from "vitest";
import { listTenantsForUser, upsertTenantMembership } from "./memberships.js";

function makeClient(
  overrides: {
    userTenantRoles?: { upsert?: () => unknown; select?: () => unknown };
    tenants?: { select?: () => unknown };
  } = {}
) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === "user_tenant_roles") {
          return {
            upsert:
              overrides.userTenantRoles?.upsert ??
              (async () => ({ error: null })),
            select:
              overrides.userTenantRoles?.select ??
              (() => ({
                eq: () => Promise.resolve({ error: null, data: [] }),
              })),
          };
        }
        if (table === "tenants") {
          return {
            select:
              overrides.tenants?.select ??
              (() => ({
                in: () => ({
                  order: () => Promise.resolve({ error: null, data: [] }),
                }),
              })),
          };
        }
        return {};
      },
    }),
  };
}

describe("upsertTenantMembership", () => {
  it("succeeds when upsert returns no error", async () => {
    const client = makeClient({
      userTenantRoles: {
        upsert: async () => ({ error: null }),
      },
    });
    await expect(
      upsertTenantMembership(client as never, {
        userId: "u1",
        tenantId: "t1",
        role: "admin",
      })
    ).resolves.toBeUndefined();
  });

  it("throws when upsert returns error", async () => {
    const err = new Error("upsert failed");
    const client = makeClient({
      userTenantRoles: {
        upsert: async () => ({ error: err }),
      },
    });
    await expect(
      upsertTenantMembership(client as never, {
        userId: "u1",
        tenantId: "t1",
        role: "member",
      })
    ).rejects.toThrow("upsert failed");
  });
});

describe("listTenantsForUser", () => {
  it("returns tenants for user", async () => {
    const client = makeClient({
      userTenantRoles: {
        select: () => ({
          eq: () =>
            Promise.resolve({
              error: null,
              data: [{ tenant_id: "t1" }, { tenant_id: "t2" }],
            }),
        }),
      },
      tenants: {
        select: () => ({
          in: () => ({
            order: () =>
              Promise.resolve({
                error: null,
                data: [
                  { id: "t1", slug: "acme", name: "Acme" },
                  { id: "t2", slug: "beta", name: "Beta" },
                ],
              }),
          }),
        }),
      },
    });
    const result = await listTenantsForUser(client as never, "u1");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "t1", slug: "acme", name: "Acme" });
    expect(result[1]).toEqual({ id: "t2", slug: "beta", name: "Beta" });
  });

  it("returns empty array when user has no memberships", async () => {
    const client = makeClient({
      userTenantRoles: {
        select: () => ({
          eq: () => Promise.resolve({ error: null, data: [] }),
        }),
      },
    });
    const result = await listTenantsForUser(client as never, "u1");
    expect(result).toEqual([]);
  });

  it("throws when memberships query errors", async () => {
    const err = new Error("select failed");
    const client = makeClient({
      userTenantRoles: {
        select: () => ({
          eq: () => Promise.resolve({ error: err, data: null }),
        }),
      },
    });
    await expect(listTenantsForUser(client as never, "u1")).rejects.toThrow(
      "select failed"
    );
  });

  it("throws when tenants query errors", async () => {
    const err = new Error("tenants failed");
    const client = makeClient({
      userTenantRoles: {
        select: () => ({
          eq: () =>
            Promise.resolve({
              error: null,
              data: [{ tenant_id: "t1" }],
            }),
        }),
      },
      tenants: {
        select: () => ({
          in: () => ({
            order: () => Promise.resolve({ error: err, data: null }),
          }),
        }),
      },
    });
    await expect(listTenantsForUser(client as never, "u1")).rejects.toThrow(
      "tenants failed"
    );
  });
});
