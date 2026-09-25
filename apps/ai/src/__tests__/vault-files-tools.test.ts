import { describe, expect, it } from "vitest";
import { resolveScopedVaultKey } from "../../ai/tools/vault-files/lib/key-scope.js";

describe("resolveScopedVaultKey", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";

  it("scopes relative keys under the tenant prefix", () => {
    expect(resolveScopedVaultKey(tenantId, "expenses/receipt.pdf")).toBe(
      `tenants/${tenantId}/expenses/receipt.pdf`
    );
  });

  it("keeps another tenant's full key under the caller's tenant", () => {
    const otherTenant = "22222222-2222-4222-8222-222222222222";
    expect(
      resolveScopedVaultKey(tenantId, `tenants/${otherTenant}/a.pdf`)
    ).toBe(`tenants/${tenantId}/tenants/${otherTenant}/a.pdf`);
  });

  it("rejects traversal", () => {
    expect(() => resolveScopedVaultKey(tenantId, "../other/a.pdf")).toThrow(
      "vault_key_invalid"
    );
  });
});
