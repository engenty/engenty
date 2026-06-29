import { describe, expect, it } from "vitest";
import { resolveScopedVaultKey } from "../../ai/tools/vault-files/lib/key-scope.js";

describe("resolveScopedVaultKey", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";

  it("scopes relative keys under the tenant prefix", () => {
    expect(resolveScopedVaultKey(tenantId, "expenses/receipt.pdf")).toBe(
      `tenants/${tenantId}/expenses/receipt.pdf`
    );
  });

  it("preserves fully scoped tenant keys", () => {
    const key = `tenants/${tenantId}/inbox/msg/a.pdf`;
    expect(resolveScopedVaultKey(tenantId, key)).toBe(key);
  });

  it("rejects traversal", () => {
    expect(() => resolveScopedVaultKey(tenantId, "../other/a.pdf")).toThrow(
      "vault_key_invalid"
    );
  });
});
