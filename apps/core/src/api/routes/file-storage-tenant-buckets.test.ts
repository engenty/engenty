import { describe, expect, it } from "vitest";
import {
  assertKeyInTenant,
  findTenantBucket,
  relativeToTenantRoot,
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

describe("findTenantBucket", () => {
  it("defaults to the files bucket and rejects unknown buckets", () => {
    expect(findTenantBucket(undefined)?.id).toBe("files");
    expect(findTenantBucket("module-kb-attachments")).toBeUndefined();
    expect(findTenantBucket("expenses")).toBeUndefined();
  });
});

describe("resolveTenantPrefix", () => {
  it("roots an empty prefix at the tenant root (files convention)", () => {
    expect(resolveTenantPrefix(filesBucket, TENANT, undefined)).toBe(
      `tenants/${TENANT}/`
    );
  });

  it("roots an empty prefix at the tenant root (module convention)", () => {
    expect(resolveTenantPrefix(moduleBucket, TENANT, "")).toBe(`${TENANT}/`);
  });

  it("treats a bare prefix as relative to the tenant root", () => {
    expect(resolveTenantPrefix(filesBucket, TENANT, "inbox/2024")).toBe(
      `tenants/${TENANT}/inbox/2024`
    );
  });

  it("keeps an already-absolute in-scope prefix", () => {
    expect(
      resolveTenantPrefix(filesBucket, TENANT, `tenants/${TENANT}/inbox`)
    ).toBe(`tenants/${TENANT}/inbox`);
  });

  it("rejects path traversal", () => {
    expect(() =>
      resolveTenantPrefix(filesBucket, TENANT, `../${OTHER}`)
    ).toThrow(TenantScopeViolationError);
  });

  it("rejects an absolute prefix pointing at another tenant", () => {
    expect(() =>
      resolveTenantPrefix(moduleBucket, TENANT, `${OTHER}/secret`)
    ).not.toThrow();
    // module convention: `<other>/...` is treated as a *relative* folder under
    // this tenant, so it stays scoped — it never reaches the other tenant.
    expect(resolveTenantPrefix(moduleBucket, TENANT, `${OTHER}/x`)).toBe(
      `${TENANT}/${OTHER}/x`
    );
  });
});

describe("assertKeyInTenant", () => {
  it("accepts a key under the tenant root", () => {
    expect(() =>
      assertKeyInTenant(filesBucket, TENANT, `tenants/${TENANT}/a/b.pdf`)
    ).not.toThrow();
    expect(() =>
      assertKeyInTenant(moduleBucket, TENANT, `${TENANT}/inv/1.pdf`)
    ).not.toThrow();
  });

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

describe("relativeToTenantRoot", () => {
  it("strips the tenant root for display", () => {
    expect(
      relativeToTenantRoot(filesBucket, TENANT, `tenants/${TENANT}/inbox/`)
    ).toBe("inbox/");
    expect(relativeToTenantRoot(moduleBucket, TENANT, `${TENANT}/inv/`)).toBe(
      "inv/"
    );
  });
});
