import { describe, expect, it } from "vitest";
import {
  assertTenantScopedStorageKey,
  FileStorageTenantScopeError,
} from "./tenant-storage-key.js";

const TENANT = "11111111-1111-4111-8111-111111111111";

describe("assertTenantScopedStorageKey", () => {
  it("accepts keys under the tenant prefix", () => {
    expect(() =>
      assertTenantScopedStorageKey(
        `tenants/${TENANT}/expenses/receipt.pdf`,
        TENANT
      )
    ).not.toThrow();
  });

  it("rejects keys outside the tenant prefix", () => {
    expect(() =>
      assertTenantScopedStorageKey("tenants/other/expenses/a.pdf", TENANT)
    ).toThrow(FileStorageTenantScopeError);
  });

  it("rejects path traversal", () => {
    expect(() =>
      assertTenantScopedStorageKey(`tenants/${TENANT}/../other/a.pdf`, TENANT)
    ).toThrow(FileStorageTenantScopeError);
  });
});
