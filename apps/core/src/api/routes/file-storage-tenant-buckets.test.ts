import { describe, expect, it } from "vitest";
import {
  assertKeyInTenant,
  findTenantBucket,
  resolveTenantPrefix,
  TenantScopeViolationError,
} from "./file-storage-tenant-buckets.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const filesBucket = findTenantBucket("files");
const moduleBucket = findTenantBucket("module-invoices-pdfs");

if (!(filesBucket && moduleBucket)) {
  throw new Error("expected registry buckets to exist");
}

describe("resolveTenantPrefix", () => {
  it("rejects path traversal", () => {
    expect(() =>
      resolveTenantPrefix(filesBucket, TENANT, `../${OTHER}`)
    ).toThrow(TenantScopeViolationError);
  });

  it("keeps another tenant's id scoped under the caller's root", () => {
    expect(resolveTenantPrefix(moduleBucket, TENANT, `${OTHER}/x`)).toBe(
      `${TENANT}/${OTHER}/x`
    );
  });
});

describe("assertKeyInTenant", () => {
  it("rejects another tenant's key", () => {
    expect(() =>
      assertKeyInTenant(filesBucket, TENANT, `tenants/${OTHER}/a.pdf`)
    ).toThrow(TenantScopeViolationError);
    expect(() =>
      assertKeyInTenant(moduleBucket, TENANT, `${OTHER}/inv/1.pdf`)
    ).toThrow(TenantScopeViolationError);
  });

  it("rejects traversal", () => {
    expect(() =>
      assertKeyInTenant(filesBucket, TENANT, `tenants/${TENANT}/../x`)
    ).toThrow(TenantScopeViolationError);
  });
});
