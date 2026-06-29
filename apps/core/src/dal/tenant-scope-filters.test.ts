import { describe, expect, it } from "vitest";
import {
  assertTenantMatch,
  tenantScopeFilters,
} from "./tenant-scope-filters.js";

describe("tenantScopeFilters", () => {
  it("returns tenant_id and scope_id", () => {
    const ctx = { tenantId: "t1", scopeId: "s1" };
    expect(tenantScopeFilters(ctx)).toEqual({
      tenant_id: "t1",
      scope_id: "s1",
    });
  });
});

describe("assertTenantMatch", () => {
  it("does not throw when tenant matches", () => {
    const ctx = { tenantId: "t1", scopeId: "s1" };
    expect(() => assertTenantMatch(ctx, "t1")).not.toThrow();
  });

  it("throws when tenant does not match", () => {
    const ctx = { tenantId: "t1", scopeId: "s1" };
    expect(() => assertTenantMatch(ctx, "t2")).toThrow(/Tenant mismatch/);
  });
});
